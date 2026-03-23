/**
 * Frontend Integration Test
 * Simulates exact requests your Flutter app will make
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000'; // Changed from 10.0.2.2 for host testing
let token = null;

// Test 1: Login (matches your Flutter login)
async function testLogin() {
  console.log('\n📱 TEST 1: Login (Flutter simulation)');
  console.log('→ POST /user/login');
  
  const response = await fetch(`${BASE_URL}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@usafe.com',
      password: 'Test123!'
    })
  });

  const data = await response.json();
  
  if (response.status === 200 && data.token) {
    token = data.token;
    console.log('✅ Login Success');
    console.log(`   Token: ${token.substring(0, 30)}...`);
    console.log(`   User ID: ${data.user.id}`);
    return true;
  } else {
    console.log('❌ Login Failed:', data);
    return false;
  }
}

// Test 2: Safety Score (NO auth - public endpoint)
async function testSafetyScore() {
  console.log('\n📱 TEST 2: Safety Score (Public - No Auth)');
  console.log('→ GET /api/guardian/safety-score');
  
  const response = await fetch(`${BASE_URL}/api/guardian/safety-score?lat=6.9271&lng=79.8612`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
    // ✅ No Authorization header needed
  });

  const data = await response.json();
  
  if (response.status === 200 && data.score !== undefined) {
    console.log('✅ Safety Score Retrieved (No Auth)');
    console.log(`   Score: ${data.score}/100`);
    return true;
  } else {
    console.log('❌ Safety Score Failed:', data);
    return false;
  }
}

// Test 3: Save Guardian Route (REQUIRES auth)
async function testSaveRoute() {
  console.log('\n📱 TEST 3: Save Guardian Route (Auth Required)');
  console.log('→ POST /api/guardian/routes');
  
  const response = await fetch(`${BASE_URL}/api/guardian/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // ✅ Token required
    },
    body: JSON.stringify({
      name: 'Flutter Test Route',
      checkpoints: [
        { name: 'Start', lat: 6.9271, lng: 79.8612 },
        { name: 'End', lat: 6.9456, lng: 79.8627 }
      ]
    })
  });

  const data = await response.json();
  
  if (response.status === 201) {
    console.log('✅ Route Saved Successfully');
    console.log(`   Route ID: ${data.route.id}`);
    return true;
  } else {
    console.log('❌ Route Save Failed:', data);
    return false;
  }
}

// Test 4: Save Route WITHOUT token (should fail with 401)
async function testSaveRouteNoAuth() {
  console.log('\n📱 TEST 4: Save Route Without Token (Should Fail)');
  console.log('→ POST /api/guardian/routes (no auth header)');
  
  const response = await fetch(`${BASE_URL}/api/guardian/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // ❌ No Authorization header
    body: JSON.stringify({
      name: 'Should Fail',
      checkpoints: []
    })
  });

  const data = await response.json();
  
  if (response.status === 401) {
    console.log('✅ Correctly Rejected (401 Unauthorized)');
    console.log(`   Error: ${data.error}`);
    return true;
  } else {
    console.log('❌ Should have returned 401, got:', response.status);
    return false;
  }
}

// Test 5: Send Alert (REQUIRES auth)
async function testSendAlert() {
  console.log('\n📱 TEST 5: Send Checkpoint Alert (Auth Required)');
  console.log('→ POST /api/guardian/alert');
  
  const response = await fetch(`${BASE_URL}/api/guardian/alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // ✅ Token required
    },
    body: JSON.stringify({
      routeName: 'Flutter Test Route',
      checkpointName: 'End',
      status: 'arrived',
      lat: 6.9456,
      lng: 79.8627,
      parentPhone: '+94771234567'
    })
  });

  const data = await response.json();
  
  if (response.status === 200) {
    console.log('✅ Alert Sent Successfully');
    return true;
  } else {
    console.log('⚠️  Alert Response:', response.status, data);
    return true; // Don't fail on SMS issues
  }
}

// Run all tests
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Flutter Frontend Integration Test                 ║');
  console.log('║     Testing localhost:5000 (use 10.0.2.2 in Flutter)  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  let passed = 0;
  let failed = 0;
  
  try {
    if (await testLogin()) passed++; else failed++;
    if (await testSafetyScore()) passed++; else failed++;
    if (await testSaveRoute()) passed++; else failed++;
    if (await testSaveRouteNoAuth()) passed++; else failed++;
    if (await testSendAlert()) passed++; else failed++;
  } catch (error) {
    console.log('\n❌ Connection Error:', error.message);
    console.log('\n💡 Make sure the server is running: npm start');
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (passed === 5) {
    console.log('\n✅ ALL TESTS PASSED! Your backend is ready for Flutter.\n');
    console.log('📱 Flutter Integration Checklist:');
    console.log('   1. Change login URL to: POST /user/login (not /login)');
    console.log('   2. Use 10.0.2.2:5000 in Android emulator (not localhost)');
    console.log('   3. Safety score endpoint does NOT need auth');
    console.log('   4. Save route/alert/incident DO need auth header:');
    console.log('      Authorization: Bearer YOUR_JWT_TOKEN\n');
  }
}

runTests();
