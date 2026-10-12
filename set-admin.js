const { initializeApp, applicationDefault } =
  require('firebase-admin/app');

const { getAuth } = require('firebase-admin/auth');

initializeApp({
  credential: applicationDefault()
});

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error('Usage: node set-admin.js admin@example.com');
  }

  const user = await getAuth().getUserByEmail(email);

  await getAuth().setCustomUserClaims(user.uid, {
    admin: true
  });

  console.log(`Admin role assigned to ${user.email}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
