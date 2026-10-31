import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Check,
  Inbox,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import {
  APP_OWNER_EMAIL,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  SUGGESTION_SCHEMA_LIMITS,
} from '../firebase';
import {
  SuggestionCategory,
  SuggestionItem,
  SuggestionStatus,
} from '../types';

interface SuggestionsViewProps {
  currentUser: User | null;
  authReady: boolean;
}

const CATEGORY_OPTIONS: Array<{
  value: SuggestionCategory;
  label: string;
  hint: string;
}> = [
  {
    value: SuggestionCategory.Feature,
    label: 'Add feature',
    hint: 'Suggest a new capability or workflow to add to Dayline.',
  },
  {
    value: SuggestionCategory.Improvement,
    label: 'Improve existing',
    hint: 'Suggest a tweak to make scheduling, focus, or exports smoother.',
  },
  {
    value: SuggestionCategory.Ux,
    label: 'Design & clarity',
    hint: 'Share feedback on layout, readability, or mobile comfort.',
  },
  {
    value: SuggestionCategory.Bug,
    label: 'Something broke',
    hint: 'Report unexpected behavior so it can be fixed quickly.',
  },
];

const STATUS_OPTIONS: Array<{
  value: SuggestionStatus;
  label: string;
  toneClass: string;
}> = [
  { value: SuggestionStatus.New, label: 'New', toneClass: 'text-cobalt-700' },
  {
    value: SuggestionStatus.Reviewing,
    label: 'Reviewing',
    toneClass: 'text-[#B45309]',
  },
  {
    value: SuggestionStatus.Planned,
    label: 'Planned',
    toneClass: 'text-[#6D28D9]',
  },
  {
    value: SuggestionStatus.Implemented,
    label: 'Implemented',
    toneClass: 'text-[#15803D]',
  },
  {
    value: SuggestionStatus.Archived,
    label: 'Archived',
    toneClass: 'text-slate-500',
  },
];

function getCategoryLabel(cat: SuggestionCategory): string {
  switch (cat) {
    case SuggestionCategory.Feature:
      return 'Feature request';
    case SuggestionCategory.Improvement:
      return 'Improvement';
    case SuggestionCategory.Ux:
      return 'Design & UX';
    case SuggestionCategory.Bug:
      return 'Issue report';
  }
}

function getStatusMeta(status: SuggestionStatus) {
  return (
    STATUS_OPTIONS.find((s) => s.value === status) ?? {
      value: SuggestionStatus.New,
      label: 'New',
      toneClass: 'text-cobalt-700',
    }
  );
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (
    val &&
    typeof val === 'object' &&
    'seconds' in val &&
    typeof (val as { seconds: unknown }).seconds === 'number'
  ) {
    return (val as { seconds: number }).seconds * 1000;
  }
  return Date.now();
}

function formatSuggestionDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SuggestionsView: React.FC<SuggestionsViewProps> = ({
  currentUser,
  authReady,
}) => {
  const isOwner = Boolean(
    currentUser &&
      currentUser.emailVerified &&
      currentUser.email?.toLowerCase() === APP_OWNER_EMAIL.toLowerCase()
  );

  // Auth / general UI state
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // Composer form state
  const [authorName, setAuthorName] = useState<string>('');
  const [category, setCategory] = useState<SuggestionCategory>(
    SuggestionCategory.Feature
  );
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedNotice, setSubmittedNotice] = useState<boolean>(false);

  // Firestore suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);

  // Owner Inbox filtering & draft replies
  const [statusFilter, setStatusFilter] = useState<'all' | SuggestionStatus>('all');
  const [draftStatuses, setDraftStatuses] = useState<Record<string, SuggestionStatus>>({});
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedToastId, setSavedToastId] = useState<string | null>(null);

  // Author inline edit state (when status === 'new')
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editMessage, setEditMessage] = useState<string>('');
  const [editCategory, setEditCategory] = useState<SuggestionCategory>(
    SuggestionCategory.Feature
  );

  // Pre-fill display name when user signs in
  useEffect(() => {
    if (!currentUser) return;
    setAuthorName((prev) => {
      if (prev.trim()) return prev;
      const fallback =
        currentUser.displayName?.trim() ||
        currentUser.email?.split('@')[0] ||
        'Dayline User';
      return fallback.slice(0, SUGGESTION_SCHEMA_LIMITS.authorNameMaxLength);
    });
  }, [currentUser]);

  // Subscribe to suggestions only when auth is ready and user is verified
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) {
      setSuggestions([]);
      setIsLoadingItems(false);
      return;
    }

    setIsLoadingItems(true);
    setUiError(null);

    const collectionRef = collection(db, 'suggestions');
    const targetQuery = isOwner
      ? collectionRef
      : query(collectionRef, where('authorUid', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      targetQuery,
      (snapshot) => {
        const mapped: SuggestionItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            authorUid: String(d.authorUid || ''),
            authorName: String(d.authorName || 'User'),
            authorEmail: String(d.authorEmail || ''),
            category: (d.category as SuggestionCategory) || SuggestionCategory.Feature,
            title: String(d.title || ''),
            message: String(d.message || ''),
            status: (d.status as SuggestionStatus) || SuggestionStatus.New,
            ownerReply: String(d.ownerReply || ''),
            createdAtMs: toMillis(d.createdAt),
            updatedAtMs: toMillis(d.updatedAt),
          };
        });

        mapped.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setSuggestions(mapped);
        setIsLoadingItems(false);
      },
      (error) => {
        setIsLoadingItems(false);
        setUiError('Unable to load suggestions right now. Please refresh and try again.');
        try {
          handleFirestoreError(error, OperationType.LIST, 'suggestions');
        } catch {
          // Structured error logged via handleFirestoreError
        }
      }
    );

    return () => unsubscribe();
  }, [authReady, currentUser, isOwner]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setUiError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && !err.message.includes('popup-closed-by-user')
          ? 'Sign-in could not complete. Please allow the Google sign-in popup and try again.'
          : null;
      if (msg) setUiError(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setUiError(null);
    await signOut(auth);
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.emailVerified || !currentUser.email) {
      setUiError('Please sign in with a verified Google account to submit a suggestion.');
      return;
    }

    const cleanName = (authorName.trim() || 'Dayline User').slice(
      0,
      SUGGESTION_SCHEMA_LIMITS.authorNameMaxLength
    );
    const cleanTitle = title.trim().slice(0, SUGGESTION_SCHEMA_LIMITS.titleMaxLength);
    const cleanMessage = message
      .trim()
      .slice(0, SUGGESTION_SCHEMA_LIMITS.messageMaxLength);
    const cleanEmail = currentUser.email.slice(
      0,
      SUGGESTION_SCHEMA_LIMITS.authorEmailMaxLength
    );

    if (cleanTitle.length < SUGGESTION_SCHEMA_LIMITS.titleMinLength) {
      setUiError(
        `Please enter a short summary of at least ${SUGGESTION_SCHEMA_LIMITS.titleMinLength} characters.`
      );
      return;
    }
    if (cleanMessage.length < SUGGESTION_SCHEMA_LIMITS.messageMinLength) {
      setUiError(
        `Please describe your suggestion in at least ${SUGGESTION_SCHEMA_LIMITS.messageMinLength} characters.`
      );
      return;
    }

    const suggestionId = `sug-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .replace(/[^a-zA-Z0-9_-]/g, '')}`;

    if (
      !SUGGESTION_SCHEMA_LIMITS.idPattern.test(suggestionId) ||
      suggestionId.length > SUGGESTION_SCHEMA_LIMITS.idMaxLength
    ) {
      setUiError('Invalid suggestion identifier generated. Please retry.');
      return;
    }

    setIsSubmitting(true);
    setUiError(null);

    const docPath = `suggestions/${suggestionId}`;
    try {
      await setDoc(doc(db, 'suggestions', suggestionId), {
        authorUid: currentUser.uid,
        authorName: cleanName,
        authorEmail: cleanEmail,
        category,
        title: cleanTitle,
        message: cleanMessage,
        status: SuggestionStatus.New,
        ownerReply: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTitle('');
      setMessage('');
      setSubmittedNotice(true);
      window.setTimeout(() => setSubmittedNotice(false), 3500);
    } catch (error) {
      setUiError('Could not submit your suggestion. Please try again.');
      try {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      } catch {
        // Logged via handleFirestoreError
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOwnerUpdate = async (item: SuggestionItem) => {
    if (!isOwner) return;
    const nextStatus = draftStatuses[item.id] ?? item.status;
    const nextReply = (draftReplies[item.id] ?? item.ownerReply)
      .trim()
      .slice(0, SUGGESTION_SCHEMA_LIMITS.ownerReplyMaxLength);

    setSavingId(item.id);
    setUiError(null);
    const docPath = `suggestions/${item.id}`;
    try {
      await updateDoc(doc(db, 'suggestions', item.id), {
        status: nextStatus,
        ownerReply: nextReply,
        updatedAt: serverTimestamp(),
      });
      setSavedToastId(item.id);
      window.setTimeout(() => {
        setSavedToastId((prev) => (prev === item.id ? null : prev));
      }, 2200);
    } catch (error) {
      setUiError('Could not save your triage update.');
      try {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      } catch {
        // Logged via handleFirestoreError
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAuthorEdit = async (item: SuggestionItem) => {
    const cleanTitle = editTitle
      .trim()
      .slice(0, SUGGESTION_SCHEMA_LIMITS.titleMaxLength);
    const cleanMessage = editMessage
      .trim()
      .slice(0, SUGGESTION_SCHEMA_LIMITS.messageMaxLength);
    const cleanName = (authorName.trim() || item.authorName).slice(
      0,
      SUGGESTION_SCHEMA_LIMITS.authorNameMaxLength
    );

    if (
      cleanTitle.length < SUGGESTION_SCHEMA_LIMITS.titleMinLength ||
      cleanMessage.length < SUGGESTION_SCHEMA_LIMITS.messageMinLength
    ) {
      setUiError('Please keep at least 3 characters in the summary and 5 in the message.');
      return;
    }

    setSavingId(item.id);
    setUiError(null);
    const docPath = `suggestions/${item.id}`;
    try {
      await updateDoc(doc(db, 'suggestions', item.id), {
        category: editCategory,
        title: cleanTitle,
        message: cleanMessage,
        authorName: cleanName,
        updatedAt: serverTimestamp(),
      });
      setEditingItemId(null);
    } catch (error) {
      setUiError('Could not update your suggestion.');
      try {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      } catch {
        // Logged via handleFirestoreError
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteSuggestion = async (item: SuggestionItem) => {
    setSavingId(item.id);
    setUiError(null);
    const docPath = `suggestions/${item.id}`;
    try {
      await deleteDoc(doc(db, 'suggestions', item.id));
    } catch (error) {
      setUiError('Could not remove suggestion.');
      try {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      } catch {
        // Logged via handleFirestoreError
      }
    } finally {
      setSavingId(null);
    }
  };

  const inboxMetrics = useMemo(() => {
    const total = suggestions.length;
    const newCount = suggestions.filter((s) => s.status === SuggestionStatus.New).length;
    const plannedCount = suggestions.filter(
      (s) => s.status === SuggestionStatus.Planned
    ).length;
    const implementedCount = suggestions.filter(
      (s) => s.status === SuggestionStatus.Implemented
    ).length;
    return { total, newCount, plannedCount, implementedCount };
  }, [suggestions]);

  const visibleSuggestions = useMemo(() => {
    if (!isOwner || statusFilter === 'all') return suggestions;
    return suggestions.filter((s) => s.status === statusFilter);
  }, [suggestions, isOwner, statusFilter]);

  const activeCategoryHint =
    CATEGORY_OPTIONS.find((c) => c.value === category)?.hint ?? '';

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-8 lg:py-10">
      {uiError && (
        <div
          role="alert"
          className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4"
        >
          <p className="text-sm text-red-900">{uiError}</p>
          <button
            type="button"
            onClick={() => setUiError(null)}
            className="text-xs font-semibold text-red-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {!authReady ? (
        <div className="bg-white border border-[#DCE3EE] rounded-xl p-8">
          <div className="h-5 w-52 bg-surface-tint rounded animate-pulse" />
          <div className="mt-3 h-4 w-96 max-w-full bg-surface-tint rounded animate-pulse" />
        </div>
      ) : !currentUser ? (
        /* Unauthenticated Gate: Clean Google Sign-In to Submit or Open Owner Inbox */
        <div className="max-w-2xl mx-auto bg-white border border-[#DCE3EE] rounded-xl p-8 md:p-10">
          <div className="flex items-center gap-2.5 text-cobalt-600 text-xs font-semibold">
            <MessageSquarePlus className="w-4 h-4" />
            <span>PRODUCT FEEDBACK & SUGGESTIONS</span>
          </div>
          <h1 className="mt-2.5 text-2xl md:text-3xl font-bold text-oxford-950 tracking-tight">
            Tell us what to improve or add next.
          </h1>
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            Have an idea for a feature, a workflow tweak, or something you wish worked differently? Sign in to send your suggestion directly to the creator’s inbox and see updates when it is reviewed.
          </p>

          <div className="mt-6 pt-6 border-t border-[#E8EEF6] space-y-2.5 text-xs text-slate-600">
            <p>
              <strong className="font-semibold text-oxford-950">Direct to creator:</strong>{' '}
              Every message goes straight to the Dayline owner inbox—no public wall or noise.
            </p>
            <p>
              <strong className="font-semibold text-oxford-950">Track status & replies:</strong>{' '}
              See when your suggestion moves to Reviewing, Planned, or Implemented.
            </p>
          </div>

          <div className="mt-7">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <LogIn className="w-4 h-4" />
              {isSigningIn ? 'Signing in...' : 'Continue with Google'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Left Column: Share a Suggestion Form */}
          <section className="lg:col-span-5 bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-oxford-950 tracking-tight">
                  Share a suggestion
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  What should we change, refine, or add to make Dayline more helpful for your day?
                </p>
              </div>
            </div>

            <div className="mt-4 py-2.5 px-3 bg-[#F9FBFE] border border-[#E8EEF6] rounded-lg flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0 truncate text-slate-600">
                Signed in as{' '}
                <span className="font-semibold text-oxford-950">
                  {currentUser.email}
                </span>
                {isOwner && (
                  <span className="text-cobalt-700 font-semibold"> · App Owner</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-oxford-950 font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>

            <form onSubmit={handleSubmitSuggestion} className="mt-5 space-y-4">
              {/* Suggestion Category */}
              <div>
                <span className="block text-sm font-semibold text-oxford-950 mb-1.5">
                  What is this about?
                </span>
                <div
                  role="group"
                  aria-label="Suggestion category"
                  className="grid grid-cols-2 gap-1.5 p-1 bg-surface-tint rounded-lg"
                >
                  {CATEGORY_OPTIONS.map((opt) => {
                    const selected = category === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selected
                            ? 'bg-oxford-950 text-white shadow-xs'
                            : 'text-slate-600 hover:text-oxford-950'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-slate-600">{activeCategoryHint}</p>
              </div>

              {/* Display Name */}
              <div>
                <label
                  htmlFor="suggestion-author-name"
                  className="block text-sm font-semibold text-oxford-950 mb-1.5"
                >
                  Your name
                </label>
                <input
                  id="suggestion-author-name"
                  type="text"
                  maxLength={SUGGESTION_SCHEMA_LIMITS.authorNameMaxLength}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-[#DCE3EE] bg-white px-3.5 py-2 text-sm text-oxford-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600"
                />
              </div>

              {/* Short Summary */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="suggestion-title"
                    className="text-sm font-semibold text-oxford-950"
                  >
                    Short summary
                  </label>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {title.length}/{SUGGESTION_SCHEMA_LIMITS.titleMaxLength}
                  </span>
                </div>
                <input
                  id="suggestion-title"
                  type="text"
                  required
                  minLength={SUGGESTION_SCHEMA_LIMITS.titleMinLength}
                  maxLength={SUGGESTION_SCHEMA_LIMITS.titleMaxLength}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Add recurring daily habits or dark mode"
                  className="w-full rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] px-3.5 py-2 text-sm text-oxford-950 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600"
                />
              </div>

              {/* Detailed Message */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="suggestion-message"
                    className="text-sm font-semibold text-oxford-950"
                  >
                    Details & what should change
                  </label>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {message.length}/{SUGGESTION_SCHEMA_LIMITS.messageMaxLength}
                  </span>
                </div>
                <textarea
                  id="suggestion-message"
                  rows={4}
                  required
                  minLength={SUGGESTION_SCHEMA_LIMITS.messageMinLength}
                  maxLength={SUGGESTION_SCHEMA_LIMITS.messageMaxLength}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what you would love to see added, changed, or improved..."
                  className="w-full rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] px-3.5 py-2.5 text-sm text-oxford-950 placeholder:text-slate-400 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-cobalt-600/20 focus:border-cobalt-600 resize-y"
                />
              </div>

              {submittedNotice && (
                <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg flex items-center gap-2 text-xs font-medium text-[#15803D]">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Thank you—your suggestion was delivered to the creator inbox.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  title.trim().length < SUGGESTION_SCHEMA_LIMITS.titleMinLength ||
                  message.trim().length < SUGGESTION_SCHEMA_LIMITS.messageMinLength
                }
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Sending suggestion...' : 'Send suggestion'}
              </button>
            </form>
          </section>

          {/* Right Column: Owner Suggestions Inbox OR User's Submitted Suggestions */}
          <section className="lg:col-span-7">
            <div className="bg-white border border-[#DCE3EE] rounded-xl p-6 md:p-7">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-cobalt-600 shrink-0" />
                  <h2 className="text-lg font-bold text-oxford-950 tracking-tight">
                    {isOwner ? 'Owner Suggestions Inbox' : 'Your Submitted Suggestions'}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 font-mono tabular-nums">
                  <span className="text-oxford-950 font-semibold">
                    {inboxMetrics.total} total
                  </span>
                  {isOwner && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-cobalt-700 font-semibold">
                        {inboxMetrics.newCount} new
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{inboxMetrics.plannedCount} planned</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#15803D] font-semibold">
                        {inboxMetrics.implementedCount} implemented
                      </span>
                    </>
                  )}
                </div>
              </div>

              <p className="mt-1.5 text-xs text-slate-600">
                {isOwner
                  ? 'All user messages arrive here in real time. Update a suggestion’s status or send a reply back to the user.'
                  : 'Messages you send appear below along with status updates and replies from the app creator.'}
              </p>

              {/* Owner Status Filter Strip */}
              {isOwner && suggestions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#E8EEF6] flex items-center gap-1 p-1 bg-surface-tint rounded-lg overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-oxford-950 text-white shadow-xs'
                        : 'text-slate-600 hover:text-oxford-950'
                    }`}
                  >
                    All ({suggestions.length})
                  </button>
                  {STATUS_OPTIONS.map((st) => {
                    const count = suggestions.filter((s) => s.status === st.value).length;
                    return (
                      <button
                        key={st.value}
                        type="button"
                        onClick={() => setStatusFilter(st.value)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          statusFilter === st.value
                            ? 'bg-oxford-950 text-white shadow-xs'
                            : 'text-slate-600 hover:text-oxford-950'
                        }`}
                      >
                        {st.label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Suggestions Feed */}
              {isLoadingItems ? (
                <div className="mt-6 space-y-3">
                  {[1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-[#E8EEF6] rounded-lg space-y-2"
                    >
                      <div className="h-4 w-48 bg-surface-tint rounded animate-pulse" />
                      <div className="h-3 w-full bg-surface-tint rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : visibleSuggestions.length === 0 ? (
                <div className="mt-6 py-12 text-center border-t border-[#E8EEF6]">
                  <p className="text-sm font-semibold text-oxford-950">
                    {isOwner
                      ? statusFilter === 'all'
                        ? 'No user suggestions yet'
                        : 'No suggestions match this status'
                      : 'You have not sent any suggestions yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                    {isOwner
                      ? 'When users share feature requests or feedback in Dayline, their messages will appear right here.'
                      : 'Use the form on the left whenever you spot something to add or improve.'}
                  </p>
                </div>
              ) : (
                <div className="mt-5 divide-y divide-[#E8EEF6] border-t border-[#E8EEF6]">
                  {visibleSuggestions.map((item) => {
                    const statusMeta = getStatusMeta(item.status);
                    const isEditingThis = editingItemId === item.id;
                    const canAuthorModify =
                      !isOwner &&
                      item.authorUid === currentUser.uid &&
                      item.status === SuggestionStatus.New;

                    const currentDraftStatus = draftStatuses[item.id] ?? item.status;
                    const currentDraftReply = draftReplies[item.id] ?? item.ownerReply;
                    const hasOwnerChanges =
                      currentDraftStatus !== item.status ||
                      currentDraftReply.trim() !== item.ownerReply;

                    return (
                      <article key={item.id} className="py-5 space-y-3">
                        {isEditingThis ? (
                          <div className="p-4 bg-[#F9FBFE] border border-[#DCE3EE] rounded-lg space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={editCategory}
                                onChange={(e) =>
                                  setEditCategory(e.target.value as SuggestionCategory)
                                }
                                aria-label="Edit suggestion category"
                                className="px-2.5 py-1.5 text-xs bg-white border border-[#DCE3EE] rounded-md text-oxford-950"
                              >
                                {CATEGORY_OPTIONS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                maxLength={SUGGESTION_SCHEMA_LIMITS.titleMaxLength}
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-white border border-[#DCE3EE] rounded-md text-oxford-950"
                              />
                            </div>
                            <textarea
                              rows={3}
                              maxLength={SUGGESTION_SCHEMA_LIMITS.messageMaxLength}
                              value={editMessage}
                              onChange={(e) => setEditMessage(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-white border border-[#DCE3EE] rounded-md text-oxford-950"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={savingId === item.id}
                                onClick={() => handleSaveAuthorEdit(item)}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 rounded-md cursor-pointer"
                              >
                                Save changes
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemId(null)}
                                className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-oxford-950 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Header Metadata Line (Zero static pills) */}
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h3 className="text-base font-semibold text-oxford-950">
                                {item.title}
                              </h3>

                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <span className={`font-semibold ${statusMeta.toneClass}`}>
                                  {statusMeta.label}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-oxford-900 font-medium">
                                  {getCategoryLabel(item.category)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {formatSuggestionDate(item.createdAtMs)}
                                </span>
                              </div>
                            </div>

                            {isOwner && (
                              <div className="text-xs text-slate-500">
                                From{' '}
                                <span className="font-semibold text-oxford-900">
                                  {item.authorName}
                                </span>{' '}
                                <span className="font-mono">({item.authorEmail})</span>
                              </div>
                            )}

                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                              {item.message}
                            </p>

                            {/* Non-owner view of creator reply + edit/delete controls */}
                            {!isOwner && item.ownerReply && (
                              <div className="p-3.5 bg-[#F4F8FF] border border-[#C7D7FE] rounded-lg space-y-1">
                                <span className="block text-xs font-semibold text-cobalt-700">
                                  Reply from creator
                                </span>
                                <p className="text-xs text-oxford-950 leading-relaxed whitespace-pre-line">
                                  {item.ownerReply}
                                </p>
                              </div>
                            )}

                            {canAuthorModify && (
                              <div className="flex items-center gap-3 pt-1 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditTitle(item.title);
                                    setEditMessage(item.message);
                                    setEditCategory(item.category);
                                  }}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-cobalt-600 font-medium cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === item.id}
                                  onClick={() => handleDeleteSuggestion(item)}
                                  className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600 font-medium cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Withdraw
                                </button>
                              </div>
                            )}

                            {/* Owner Triage & Reply Bar */}
                            {isOwner && (
                              <div className="pt-2 p-3.5 bg-[#F9FBFE] border border-[#E8EEF6] rounded-lg space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <label
                                      htmlFor={`status-${item.id}`}
                                      className="text-xs font-semibold text-oxford-950"
                                    >
                                      Status:
                                    </label>
                                    <select
                                      id={`status-${item.id}`}
                                      value={currentDraftStatus}
                                      onChange={(e) =>
                                        setDraftStatuses((prev) => ({
                                          ...prev,
                                          [item.id]: e.target.value as SuggestionStatus,
                                        }))
                                      }
                                      className="px-2.5 py-1 text-xs font-medium bg-white border border-[#DCE3EE] rounded-md text-oxford-950 focus:outline-none focus:border-cobalt-600"
                                    >
                                      {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={savingId === item.id}
                                    onClick={() => handleDeleteSuggestion(item)}
                                    title="Delete suggestion"
                                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    type="text"
                                    maxLength={SUGGESTION_SCHEMA_LIMITS.ownerReplyMaxLength}
                                    value={currentDraftReply}
                                    onChange={(e) =>
                                      setDraftReplies((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Write an optional reply or update note to this user..."
                                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#DCE3EE] rounded-md text-oxford-950 placeholder:text-slate-400 focus:outline-none focus:border-cobalt-600"
                                  />
                                  <button
                                    type="button"
                                    disabled={savingId === item.id || !hasOwnerChanges}
                                    onClick={() => handleOwnerUpdate(item)}
                                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt-600 hover:bg-cobalt-700 disabled:opacity-40 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    {savingId === item.id
                                      ? 'Saving...'
                                      : savedToastId === item.id
                                        ? 'Saved'
                                        : 'Update'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
