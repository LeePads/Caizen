import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readEnvFile = (filename) => {
  const file = path.join(root, filename);
  if (!fs.existsSync(file)) return {};

  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2');

        return [key, value];
      }),
  );
};

const fileEnvironment = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
};

const valueFor = (key) =>
  process.env[key] || fileEnvironment[key] || '';

const url = valueFor('NEXT_PUBLIC_SUPABASE_URL');

const publishableKey =
  valueFor('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  valueFor('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const metadataOrigin = valueFor('NEXT_PUBLIC_APP_URL');

const manifestPath = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);

const manifest = fs.existsSync(manifestPath)
  ? fs.readFileSync(manifestPath, 'utf8')
  : '';

const callbackConfigured =
  manifest.includes('android:scheme="caizen"');

const urlLooksValid = /^https:\/\/[^/]+/i.test(url);

const cloudReady =
  urlLooksValid &&
  Boolean(publishableKey) &&
  callbackConfigured;

const cloudRequired =
  valueFor('CAIZEN_REQUIRE_CLOUD') === '1';

const metadataOriginValid = (() => {
  if (!metadataOrigin) return false;

  try {
    const parsed = new URL(metadataOrigin);

    return (
      parsed.protocol === 'https:' &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
})();

console.log(`Supabase URL exists: ${Boolean(url) ? 'yes' : 'no'}`);

console.log(
  `Supabase publishable key exists: ${
    Boolean(publishableKey) ? 'yes' : 'no'
  }`,
);

console.log(
  `Cloud login can be included: ${cloudReady ? 'yes' : 'no'}`,
);

console.log(
  `Android deep-link callback configured: ${
    callbackConfigured ? 'yes' : 'no'
  }`,
);

console.log('Android redirect URL: caizen://auth/callback');

console.log(
  `Hosted music metadata: ${
    metadataOriginValid
      ? 'configured'
      : 'not configured; manual entry remains available'
  }`,
);

if (url && !urlLooksValid) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL.');
  process.exitCode = 1;
}

if (cloudRequired && !cloudReady) {
  console.error(
    'Cloud support is required for this build, but its public Supabase configuration is incomplete.',
  );
  process.exitCode = 1;
}

if (metadataOrigin && !metadataOriginValid) {
  console.error(
    'NEXT_PUBLIC_APP_URL must be a credential-free HTTPS URL when configured.',
  );
  process.exitCode = 1;
}