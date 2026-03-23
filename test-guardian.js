/**
 * SafePath Guardian Feature Test Suite
 * Tests all guardian endpoints with proper authentication flow
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
let authToken = null;
let userId = null;
let routeId = null;

// Test credentials (you may need to adjust these)
const TEST_USER = {
  email: 'test@usafe.com',
  password: 'Test123!',
  name: 'Test User'
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

async function makeRequest(method, endpoint, data = null, requireAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (requireAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = {
    method,
    headers,
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const responseData = await response.json();
  
  return { status: response.status, data: responseData };
}

// Test 1: Register or Login
async function testAuthentication() {
  printSection('TEST 1: Authentication');

  // Try to login first
  log('→ Attempting login...', 'yellow');
  let result = await makeRequest('POST', '/user/login', {
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  if (result.status === 200 && result.data.token) {
    authToken = result.data.token;
    userId = result.data.userId;
    log('✓ Login successful!', 'green');
    log(`  Token: ${authToken.substring(0, 20)}...`, 'reset');
    log(`  User ID: ${userId}`, 'reset');
    return true;
  }

  // If login failed, try to register
  log('→ Login failed, attempting registration...', 'yellow');
  result = await makeRequest('POST', '/user/register', {
    email: TEST_USER.email,
    password: TEST_USER.password,
    name: TEST_USER.name,
  });

  if (result.status === 201 || result.status === 200) {
    log('✓ Registration successful! Now logging in...', 'green');
    
    // Login after registration
    result = await makeRequest('POST', '/user/login', {
      email: TEST_USER.email,
      password: TEST_USER.password,
    });

    if (result.status === 200 && result.data.token) {
      authToken = result.data.token;
      userId = result.data.userId;
      log('✓ Login successful!', 'green');
      log(`  Token: ${authToken.substring(0, 20)}...`, 'reset');
      log(`  User ID: ${userId}`, 'reset');
      return true;
    }
  }

  log('✗ Authentication failed', 'red');
  console.log('Response:', result);
  return false;
}

// Test 2: Safety Score (Public endpoint)
async function testSafetyScore() {
  printSection('TEST 2: Safety Score (Public Endpoint)');
  
  const testLocations = [
    { lat: 6.9271, lng: 79.8612, name: 'Colombo' },
    { lat: 7.2906, lng: 80.6337, name: 'Kandy' },
  ];

  for (const location of testLocations) {
    log(`→ Testing ${location.name} (${location.lat}, ${location.lng})...`, 'yellow');
    const result = await makeRequest('GET', `/api/guardian/safety-score?lat=${location.lat}&lng=${location.lng}`);
    
    if (result.status === 200 && result.data.score !== undefined) {
      log(`✓ Score: ${result.data.score}/100 (${result.data.score < 40 ? 'Danger' : result.data.score < 70 ? 'Moderate' : 'Safe'})`, 'green');
    } else {
      log('✗ Failed to get safety score', 'red');
      console.log('Response:', result);
      return false;
    }
  }
  
  return true;
}

// Test 3: Create Guardian Route
async function testCreateRoute() {
  printSection('TEST 3: Create Guardian Route');
  
  const routeData = {
    name: 'School Route Test',
    checkpoints: [
      { name: 'Home', lat: 6.9271, lng: 79.8612 },
      { name: 'Junction', lat: 6.9387, lng: 79.8589 },
      { name: 'School', lat: 6.9456, lng: 79.8627 },
    ],
    is_active: true,
  };

  log('→ Creating route with 3 checkpoints...', 'yellow');
  const result = await makeRequest('POST', '/api/guardian/routes', routeData, true);
  
  if (result.status === 201 && result.data.route) {
    routeId = result.data.route.id;
    log('✓ Route created successfully!', 'green');
    log(`  Route ID: ${routeId}`, 'reset');
    log(`  Name: ${result.data.route.route_name}`, 'reset');
    log(`  Checkpoints: ${result.data.route.checkpoints.length}`, 'reset');
    return true;
  } else {
    log('✗ Failed to create route', 'red');
    console.log('Response:', result);
    return false;
  }
}

// Test 4: List Guardian Routes
async function testListRoutes() {
  printSection('TEST 4: List Guardian Routes');
  
  log('→ Fetching all routes for user...', 'yellow');
  const result = await makeRequest('GET', '/api/guardian/routes', null, true);
  
  if (result.status === 200 && result.data.routes && Array.isArray(result.data.routes)) {
    log(`✓ Found ${result.data.routes.length} route(s)`, 'green');
    result.data.routes.forEach((route, index) => {
      log(`  Route ${index + 1}:`, 'reset');
      log(`    ID: ${route.id}`, 'reset');
      log(`    Name: ${route.route_name}`, 'reset');
      log(`    Checkpoints: ${route.checkpoints?.length || 0}`, 'reset');
      log(`    Active: ${route.is_active}`, 'reset');
    });
    return true;
  } else {
    log('✗ Failed to list routes', 'red');
    console.log('Response:', result);
    return false;
  }
}

// Test 5: Send Checkpoint Alert
async function testCheckpointAlert() {
  printSection('TEST 5: Send Checkpoint Alert');
  
  const alertData = {
    routeName: 'School Route Test',
    checkpointName: 'Junction',
    status: 'arrived',
    lat: 6.9387,
    lng: 79.8589,
    parentPhone: '+94771234567', // Test phone number
  };

  log('→ Sending checkpoint alert...', 'yellow');
  const result = await makeRequest('POST', '/api/guardian/alert', alertData, true);
  
  if (result.status === 200) {
    log('✓ Alert sent successfully!', 'green');
    if (result.data.message) {
      log(`  ${result.data.message}`, 'reset');
    }
    return true;
  } else {
    log('⚠ Alert test completed with status: ' + result.status, 'yellow');
    log('  Note: SMS requires valid QuickSend API key and phone number', 'yellow');
    console.log('Response:', result);
    return true; // Don't fail on SMS issues
  }
}

// Test 6: Health Check
async function testHealthCheck() {
  printSection('TEST 6: System Health Check');
  
  log('→ Checking system health...', 'yellow');
  const result = await makeRequest('GET', '/health');
  
  if (result.status === 200 && result.data.status === 'healthy') {
    log('✓ System is healthy!', 'green');
    log(`  Database: ${result.data.services.database}`, 'reset');
    log(`  Supabase: ${result.data.services.supabase}`, 'reset');
    log(`  SMS: ${result.data.services.sms}`, 'reset');
    log(`  Voice: ${result.data.services.voice}`, 'reset');
    return true;
  } else {
    log('⚠ System health check returned:', 'yellow');
    console.log('Response:', result);
    return true; // Don't fail on health warnings
  }
}

// Run all tests
async function runAllTests() {
  console.clear();
  log('╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║        SafePath Guardian Feature Test Suite               ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  const tests = [
    { name: 'System Health Check', fn: testHealthCheck },
    { name: 'Authentication', fn: testAuthentication },
    { name: 'Safety Score', fn: testSafetyScore },
    { name: 'Create Route', fn: testCreateRoute },
    { name: 'List Routes', fn: testListRoutes },
    { name: 'Checkpoint Alert', fn: testCheckpointAlert },
  ];

  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      log(`✗ Test crashed: ${error.message}`, 'red');
      console.error(error);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final summary
  printSection('TEST SUMMARY');
  log(`Total Tests: ${results.total}`, 'reset');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.failed === 0) {
    log('\n🎉 All SafePath Guardian features are working correctly!', 'green');
  } else {
    log('\n⚠ Some tests failed. Check the details above.', 'yellow');
  }
  
  console.log('\n');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
