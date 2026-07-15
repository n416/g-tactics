import { execSync } from 'child_process';

const handleName = process.argv[2];

if (!handleName) {
  console.error('Usage: node make_admin.js <handle_name>');
  process.exit(1);
}

console.log(`Setting is_admin = 1 for user with handle_name: ${handleName}`);

const query = `UPDATE characters SET is_admin = 1 WHERE handle_name = '${handleName}'`;
const cmd = `npx wrangler d1 execute DB --local --command "${query}"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('✅ Admin privileges granted successfully.');
} catch (e) {
  console.error('❌ Failed to grant admin privileges.');
  process.exit(1);
}
