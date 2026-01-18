// Test connection to Docker PostgreSQL on port 5433
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
    runId: 'run3',
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

async function main() {
  log('G', 'test-port-5433.js:main', 'Testing Docker PostgreSQL on port 5433', {});
  
  const connectionString = 'postgresql://postgres:password@localhost:5433/age_verify';
  log('G', 'test-port-5433.js:main', 'Connection string', {
    port: 5433,
    database: 'age_verify',
    user: 'postgres'
  });
  
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000
  });
  
  try {
    await client.connect();
    log('G', 'test-port-5433.js:main', 'Connection successful', { connected: true });
    
    const result = await client.query('SELECT version(), current_database()');
    console.log('✅ Connection successful!');
    console.log('PostgreSQL version:', result.rows[0].version);
    console.log('Database:', result.rows[0].current_database);
    
    log('G', 'test-port-5433.js:main', 'Query successful', {
      database: result.rows[0].current_database
    });
    
    await client.end();
    console.log('\n✅ Docker PostgreSQL is working on port 5433!');
    console.log('Update your .env file with:');
    console.log('DATABASE_URL="postgresql://postgres:password@localhost:5433/age_verify"');
    
  } catch (error) {
    log('G', 'test-port-5433.js:main', 'Connection failed', {
      errorCode: error.code,
      errorMessage: error.message
    });
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
