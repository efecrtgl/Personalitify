/**
 * Grants or removes the `admin` role.
 *
 *   npm run admin:grant  -- person@example.com
 *   npm run admin:revoke -- person@example.com
 *
 * The role cannot be granted through the API: whoever can run this script already has
 * access to the server and its database, which is the right bar for creating administrators.
 */
import { getConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { revokeAllSessions } from '../src/modules/auth/session.service.js';
import { User } from '../src/modules/users/user.model.js';

/** Sets the role of the account with `email`. Returns false when there is no such account. */
export async function setRole(email, role) {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) return false;
  if (user.role !== role) {
    user.role = role;
    await user.save();
    // The role is part of the access token: signing the account out makes it take effect
    // at once instead of when the current token expires.
    await revokeAllSessions(String(user._id), { reason: 'role_changed' });
  }
  return true;
}

async function main() {
  const [action, email] = process.argv.slice(2);
  const role = { grant: 'admin', revoke: 'user' }[action];
  if (!role || !email) {
    console.error('Usage: node scripts/admin-role.js <grant|revoke> <email>');
    process.exit(2);
  }
  await connectDatabase(getConfig().mongoUri);
  try {
    if (await setRole(email, role)) {
      console.log(
        `${email} is now ${role === 'admin' ? 'an administrator' : 'a regular user'}. ` +
          'The account has been signed out everywhere; sign in again.',
      );
    } else {
      console.error(`No account with the address ${email}.`);
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
  }
}

// Run only when started from the command line, not when imported by a test.
if (process.argv[1]?.endsWith('admin-role.js')) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
