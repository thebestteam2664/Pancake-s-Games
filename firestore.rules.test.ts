/**
 * Phase 0 Dirty Dozen Security Rule Verification Spec
 * Targets @firebase/rules-unit-testing against firestore.rules.
 */

export const DIRTY_DOZEN_PAYLOADS = [
  {
    name: '1. Unauthenticated read on /users/{userId}',
    uid: null,
    op: 'get',
    path: 'users/userA',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Non-owner cross-user read on /users/userA by userB',
    uid: 'userB',
    op: 'get',
    path: 'users/userA',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Non-owner list enumeration on /users',
    uid: 'userB',
    op: 'list',
    path: 'users',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Privilege escalation attempt by renaming usernameLower to thegghampter',
    uid: 'userB',
    op: 'update',
    path: 'users/userB',
    data: {
      username: 'TheGGhampter',
      usernameLower: 'thegghampter',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Non-owner attempt to claim /config/owner lock',
    uid: 'userB',
    op: 'create',
    path: 'config/owner',
    data: {
      ownerUid: 'userB',
      ownerUsername: 'thegghampter',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Shadow field injection (isAdmin: true) on create',
    uid: 'userA',
    op: 'create',
    path: 'users/userA',
    data: {
      uid: 'userA',
      username: 'PlayerOne',
      usernameLower: 'playerone',
      favorites: [],
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Owner self-deletion on /users/{ownerUid}',
    uid: 'ownerUid',
    op: 'delete',
    path: 'users/ownerUid',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Non-owner attempt to delete userA or write /deletedAccounts/userA',
    uid: 'userB',
    op: 'create',
    path: 'deletedAccounts/userA',
    data: {
      uid: 'userA',
      username: 'PlayerOne',
      deletedBy: 'userB',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Deleted user attempting to recreate /users/userA',
    uid: 'userA',
    op: 'create',
    path: 'users/userA',
    data: {
      uid: 'userA',
      username: 'PlayerOne',
      usernameLower: 'playerone',
      favorites: [],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Non-owner list query on /gameSuggestions',
    uid: 'userB',
    op: 'list',
    path: 'gameSuggestions',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Unsafe javascript: URL in gameSuggestions create',
    uid: null,
    op: 'create',
    path: 'gameSuggestions/sug_bad',
    data: {
      suggestionId: 'sug_bad',
      title: 'Test Game',
      siteUrl: 'javascript:alert(1)',
      notes: '',
      submittedByUid: 'guest',
      submittedByUsername: 'Guest',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Unauthorized write to /test/connection',
    uid: 'userA',
    op: 'create',
    path: 'test/connection',
    data: { status: 'tampered' },
    expected: 'PERMISSION_DENIED',
  },
];
