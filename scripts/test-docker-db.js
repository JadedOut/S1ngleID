// Test connection to Docker PostgreSQL container
const { Client } = require('pg');

const SERVER_ENDPOINT = 'http://127.0.0.1:7243/ingest/560d3d18-f172-49bb-8d5c-4fa3220c1a13';
const LOG_PATH = 'c:\\Users\\jiami\\OneDrive\\Desktop\\workspace\\kms_please\\sduarf\\.cursor\\debug.log';

function log(hypothesisId, location, message, data) {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    location,
    message,
    data,
    sessionId: 'debug-session',
    runId: 'run2',
    hypothesisId
  };
  
  const fs = require('fs');
  fs.appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');
  
  fetch(SERVER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logEntry)
  }).catch(() => {});
}

async function testConnection(connectionString, description) {
  log('F', 'test-docker-db.js:testConnection', `Testing connection: ${description}`, {
    hasConnectionString: !!connectionString
  });
  
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000
  });
  
  try {
    await client.connect();
    log('F', 'test-docker-db.js:testConnection', 'Connection successful', {
      description,
      connected: true
    });
    
    // Check if database exists
    const dbResult = await client.query("SELECT current_database()");
    log('F', 'test-docker-db.js:testConnection', 'Current database', {
      database: dbResult.rows[0].current_database
    });
    
    await client.end();
    return { success: true, database: dbResult.rows[0].current_database };
  } catch (error) {
    log('F', 'test-docker-db.js:testConnection', 'Connection failed', {
      description,
      errorCode: error.code,
      errorMessage: error.message
    });
    await client.end().catch(() => {});
    return { success: false, error: error.message, code: error.code };
  }
}

async function main() {
  log('F', 'test-docker-db.js:main', 'Starting Docker PostgreSQL connection tests', {});
  
  // Test 1: Default postgres database with password "password"
  console.log('\n=== Test 1: Connecting to default "postgres" database ===');
  const test1 = await testConnection(
    'postgresql://postgres:password@localhost:5432/postgres',
    'Default postgres database'
  );
  console.log('Result:', test1.success ? '✅ SUCCESS' : `❌ FAILED: ${test1.error}`);
  
  // Test 2: Try age_verify database (might not exist)
  console.log('\n=== Test 2: Connecting to "age_verify" database ===');
  const test2 = await testConnection(
    'postgresql://postgres:password@localhost:5432/age_verify',
    'age_verify database'
  );
  console.log('Result:', test2.success ? '✅ SUCCESS' : `❌ FAILED: ${test2.error}`);
  
  // Test 3: Check what databases exist
  if (test1.success) {
    console.log('\n=== Checking existing databases ===');
    const client = new Client({
      connectionString: 'postgresql://postgres:password@localhost:5432/postgres'
    });
    try {
      await client.connect();
      const result = await client.query(
        "SELECT datname FROM pg_database WHERE datistemplate = false"
      );
      console.log('Available databases:', result.rows.map(r => r.datname).join(', '));
      log('F', 'test-docker-db.js:main', 'Available databases', {
        databases: result.rows.map(r => r.datname)
      });
      await client.end();
    } catch (err) {
      console.error('Error listing databases:', err.message);
      await client.end().catch(() => {});
    }
  }
  
  // Summary
  console.log('\n=== Summary ===');
  if (test1.success) {
    console.log('✅ Docker PostgreSQL container is accessible');
    console.log('✅ Password "password" is correct');
    if (!test2.success && test2.code === '3D000') {
      console.log('⚠️  Database "age_verify" does not exist yet');
      console.log('💡 Solution: Create the database or use "postgres" database');
    }
  } else {
    console.log('❌ Cannot connect to Docker container');
    console.log('   Check: Is container running? (docker ps)');
  }
}

main().catch(console.error);
