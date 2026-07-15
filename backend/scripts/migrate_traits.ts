import { parseTraits } from '../src/utils/traits';

// Usage: npx ts-node scripts/migrate_traits.ts

// Since we are using D1 via wrangler, this script would normally need to be executed
// via an environment where D1 is available, or implemented as an endpoint / CLI command
// that uses the D1 binding. For local development, we can run a SQL dump/update or
// execute commands via `wrangler d1 execute`.

// The prompt asked for "一括移行スクリプト". Since direct D1 access from Node.js is
// not straightforward without the miniflare/wrangler environment, we will output
// SQL update statements that can be piped into `wrangler d1 execute`.

import * as fs from 'fs';
import { execSync } from 'child_process';

async function main() {
  console.log('Fetching characters...');
  
  // Dump characters table to a temporary JSON using wrangler
  const tmpFile = './tmp_characters.json';
  try {
    execSync(`npx wrangler d1 execute gtactics-db --local --command "SELECT id, traits FROM characters" --json > ${tmpFile}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to fetch data from D1. Ensure wrangler dev is running or local db exists.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(tmpFile, 'utf-8');
  let characters: Array<{id: string, traits: string}> = [];
  try {
    const parsed = JSON.parse(rawData);
    // D1 json output format: [ { results: [ {id: "...", traits: "..."} ] } ]
    if (parsed.length > 0 && parsed[0].results) {
      characters = parsed[0].results;
    }
  } catch (e) {
    console.error('Failed to parse D1 output.');
  }

  let updateCount = 0;
  const updates: string[] = [];

  for (const char of characters) {
    if (!char.traits) continue;
    
    // Check if it's an array
    if (char.traits.trim().startsWith('[')) {
      const parsedObj = parseTraits(char.traits);
      const newTraitsStr = JSON.stringify(parsedObj);
      updates.push(`UPDATE characters SET traits = '${newTraitsStr}' WHERE id = '${char.id}';`);
      updateCount++;
    }
  }

  if (updateCount > 0) {
    const updateFile = './tmp_update_traits.sql';
    fs.writeFileSync(updateFile, updates.join('\n'));
    console.log(`Found ${updateCount} characters to update. Executing updates...`);
    execSync(`npx wrangler d1 execute gtactics-db --local --file ${updateFile}`, { stdio: 'inherit' });
    console.log('Update complete.');
    fs.unlinkSync(updateFile);
  } else {
    console.log('No characters needed trait migration.');
  }

  fs.unlinkSync(tmpFile);
}

main().catch(console.error);
