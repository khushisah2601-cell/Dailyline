import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'dayline-rules-audit';
const OWNER_EMAIL = 'ranjeetkumarsah286@gmail.com';

let testEnv: RulesTestEnvironment;

function validCreatePayload(uid: string, email: string) {
  return {
    authorUid: uid,
    authorName: 'Aarav Sharma',
    authorEmail: email,
    category: 'feature',
    title: 'Add recurring morning routine templates',
    message: 'It would be helpful to pin daily morning blocks across weekdays.',
    status: 'new',
    ownerReply: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

describe('Dayline Firestore Security Rules — Dirty Dozen Audit', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('allows a verified user to create and read their own suggestion, and verified owner to triage', async () => {
    const aliceCtx = testEnv.authenticatedContext('user_alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const aliceDb = aliceCtx.firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'suggestions', 'sug-valid-1'), validCreatePayload('user_alice', 'alice@example.com'))
    );
    await assertSucceeds(getDoc(doc(aliceDb, 'suggestions', 'sug-valid-1')));

    const ownerCtx = testEnv.authenticatedContext('owner_uid', {
      email: OWNER_EMAIL,
      email_verified: true,
    });
    const ownerDb = ownerCtx.firestore();

    await assertSucceeds(getDocs(collection(ownerDb, 'suggestions')));
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'suggestions', 'sug-valid-1'), {
        status: 'planned',
        ownerReply: 'Great idea, scheduling this for the next update.',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Dirty Payload 1: rejects authorUid spoofing on create', async () => {
    const attackerDb = testEnv
      .authenticatedContext('user_attacker', {
        email: 'attacker@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      setDoc(doc(attackerDb, 'suggestions', 'sug-spoof-1'), {
        ...validCreatePayload('user_victim', 'attacker@example.com'),
      })
    );
  });

  it('Dirty Payload 2: rejects unverified admin email spoofing on list and update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'suggestions', 'sug-seed-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const spoofedOwnerDb = testEnv
      .authenticatedContext('spoof_uid', {
        email: OWNER_EMAIL,
        email_verified: false,
      })
      .firestore();

    await assertFails(getDocs(collection(spoofedOwnerDb, 'suggestions')));
    await assertFails(
      updateDoc(doc(spoofedOwnerDb, 'suggestions', 'sug-seed-1'), {
        status: 'implemented',
        ownerReply: 'Spoofed reply',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Dirty Payload 3: rejects shadow ghost fields on create', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'suggestions', 'sug-shadow-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        isVerifiedAdmin: true,
      })
    );
  });

  it('Dirty Payload 4: rejects self-promoted status or ownerReply on create', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'suggestions', 'sug-status-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        status: 'implemented',
      })
    );
  });

  it('Dirty Payload 5: rejects author privilege escalation updating status or ownerReply', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await setDoc(
      doc(aliceDb, 'suggestions', 'sug-esc-1'),
      validCreatePayload('user_alice', 'alice@example.com')
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'suggestions', 'sug-esc-1'), {
        status: 'planned',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Dirty Payload 6: rejects PII leak via getDoc by another authenticated user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'suggestions', 'sug-pii-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const bobDb = testEnv
      .authenticatedContext('user_bob', {
        email: 'bob@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(getDoc(doc(bobDb, 'suggestions', 'sug-pii-1')));
  });

  it('Dirty Payload 7: rejects unscoped collection list scraping by non-owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'suggestions', 'sug-scrape-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const bobDb = testEnv
      .authenticatedContext('user_bob', {
        email: 'bob@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(getDocs(collection(bobDb, 'suggestions')));
    await assertSucceeds(
      getDocs(query(collection(bobDb, 'suggestions'), where('authorUid', '==', 'user_bob')))
    );
  });

  it('Dirty Payload 8: rejects author edit or delete once status is triaged/archived', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'suggestions', 'sug-locked-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        status: 'archived',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      updateDoc(doc(aliceDb, 'suggestions', 'sug-locked-1'), {
        message: 'Trying to overwrite archived suggestion text.',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(aliceDb, 'suggestions', 'sug-locked-1')));
  });

  it('Dirty Payload 9: rejects mutating immutable createdAt or authorUid on update', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await setDoc(
      doc(aliceDb, 'suggestions', 'sug-imm-1'),
      validCreatePayload('user_alice', 'alice@example.com')
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'suggestions', 'sug-imm-1'), {
        authorUid: 'someone_else',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Dirty Payload 10: rejects forged client timestamps on create', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'suggestions', 'sug-ts-1'), {
        ...validCreatePayload('user_alice', 'alice@example.com'),
        createdAt: Timestamp.fromMillis(1700000000000),
      })
    );
  });

  it('Dirty Payload 11: rejects volumetric string overflow (>1500 chars) on update', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await setDoc(
      doc(aliceDb, 'suggestions', 'sug-vol-1'),
      validCreatePayload('user_alice', 'alice@example.com')
    );

    await assertFails(
      updateDoc(doc(aliceDb, 'suggestions', 'sug-vol-1'), {
        message: 'x'.repeat(2000),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Dirty Payload 12: rejects invalid characters in document ID path', async () => {
    const aliceDb = testEnv
      .authenticatedContext('user_alice', {
        email: 'alice@example.com',
        email_verified: true,
      })
      .firestore();

    await assertFails(
      setDoc(
        doc(aliceDb, 'suggestions', 'bad$id!spaces'),
        validCreatePayload('user_alice', 'alice@example.com')
      )
    );
  });
});
