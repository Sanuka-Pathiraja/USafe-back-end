# USafe Backend - Quick Start Guide for Demo

## Pre-Demo Checklist

### 1. Environment Setup

Ensure your `.env` file has these critical values:

```env
# Database (REQUIRED)
DB_HOST=your_db_host
DB_PORT=5432
DB_USER=your_user
DB_PASS=your_password
DB_NAME=usafe_db

# Supabase (REQUIRED)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key

# JWT (REQUIRED)
JWT_SECRET=your_very_long_secure_secret_key_minimum_32_chars

# SMS (Optional but recommended for demo)
QUICKSEND_EMAIL=your_email
QUICKSEND_API_KEY=your_api_key

# Other optional services
STRIPE_SECRET_KEY=sk_test_xxx
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

### 2. Database Migration

```bash
npm run migration:run
```

### 3. Start Server

```bash
npm start
```

Server will start on `http://localhost:5000`

---

## Demo Flow (5 Minutes)

### Step 1: Health Check (10 seconds)

Show the system is fully operational:

```bash
curl http://localhost:5000/health
```

**What to highlight:**

- All services connected (database, Supabase, SMS, etc.)
- Feature flags showing what's enabled
- Response time under 100ms

---

### Step 2: User Registration (30 seconds)

```bash
curl -X POST http://localhost:5000/user/add \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Sarah",
    "lastName": "Johnson",
    "email": "sarah@example.com",
    "password": "SecurePass123",
    "phone": "+94771234567",
    "age": 28
  }'
```

**What to highlight:**

- Secure password hashing
- User created instantly
- Ready for authentication

---

### Step 3: Login & Get Token (20 seconds)

```bash
curl -X POST http://localhost:5000/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah@example.com",
    "password": "SecurePass123"
  }'
```

**Save the token from response!**

**What to highlight:**

- JWT-based authentication
- Secure, stateless sessions
- Compatible with mobile/web

---

### Step 4: Create Guardian Route (60 seconds)

```bash
curl -X POST http://localhost:5000/api/guardian/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Daily School Route",
    "checkpoints": [
      {
        "name": "Home",
        "lat": 6.9271,
        "lng": 79.8612
      },
      {
        "name": "Bus Stop",
        "lat": 6.9311,
        "lng": 79.8658
      },
      {
        "name": "School",
        "lat": 6.9351,
        "lng": 79.8705
      }
    ],
    "is_active": true
  }'
```

**What to highlight:**

- Parents can predefine safe routes
- Multiple checkpoints with GPS coordinates
- Stored securely per user

---

### Step 5: List Guardian Routes (15 seconds)

```bash
curl -X GET http://localhost:5000/api/guardian/routes \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**What to highlight:**

- Instant retrieval of all saved routes
- Shows checkpoint structure
- Ready for mobile app consumption

---

### Step 6: Get Safety Score (45 seconds)

```bash
curl -X GET "http://localhost:5000/api/guardian/safety-score?lat=6.9271&lng=79.8612"
```

**What to highlight:**

- AI-powered safety scoring (Python engine)
- Real-time location analysis
- Score range 0-100 with risk zones
- Can be integrated with route monitoring
- **Public endpoint** - no authentication needed for basic safety checks

---

### Step 7: Send Checkpoint Alert (60 seconds)

```bash
curl -X POST http://localhost:5000/api/guardian/alert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "routeName": "Daily School Route",
    "checkpointName": "Bus Stop",
    "status": "arrived",
    "parentPhone": "+94771234567"
  }'
```

**What to highlight:**

- Real-time SMS alerts to parents
- Multiple status types: arrived/danger/checkpoint
- Automatic notifications when child reaches checkpoints
- Fallback simulation mode if SMS not configured

---

## Key Talking Points During Demo

### 🎯 Problem We Solve

- Parents worry about children's safety during commutes
- No real-time visibility into child's location and safety
- Emergency response is often too slow

### 💡 Our Solution

1. **Guardian Routes**: Predefined safe paths with checkpoints
2. **Real-time Alerts**: Instant SMS when checkpoints are reached
3. **AI Safety Scoring**: ML-powered risk assessment of locations
4. **Emergency Features**: One-tap SOS with voice calls and SMS
5. **Community Safety**: Crowdsourced incident reporting

### 🚀 Technical Highlights

- **Production-Ready**: Rate limiting, health checks, error handling
- **Scalable Architecture**: PostgreSQL + Supabase hybrid
- **Secure**: JWT authentication, encrypted passwords (bcrypt)
- **Multi-Provider Integration**:
  - QuickSend (SMS)
  - Vonage (Voice)
  - Stripe (Payments)
  - Google OAuth
- **AI/ML Integration**: Python safety scoring engine
- **Real-time Monitoring**: Comprehensive health endpoints

### 📊 Market Opportunity

- Target: Parents with school-age children (5-15 years)
- Secondary: Elderly care, solo travelers, corporate safety
- Addressable market: 50M+ parents in South Asia
- Revenue model: Freemium (basic alerts free, premium features paid)

---

## Troubleshooting

### Server won't start

```bash
# Check environment validation output
npm start

# If DB connection fails, verify credentials in .env
```

### SMS not sending

- Ensure `QUICKSEND_EMAIL` and `QUICKSEND_API_KEY` are set
- System will show simulation mode if not configured
- This is OK for demo purposes

### Token expired

- Login again to get a fresh token
- Default expiration is 7 days

---

## Post-Demo Follow-up

**Files to share:**

1. `API_DOCUMENTATION.md` - Complete API reference
2. `DEMO_GUIDE.md` - This file
3. Database schema (migrations folder)
4. Postman collection (if you create one)

**Next steps:**

1. Mobile app demo (Flutter integration)
2. Admin dashboard walkthrough
3. Analytics and reporting features
4. Scaling strategy discussion

---

## Quick Stats for Pitch Deck

- **7 Core Features** implemented and tested
- **20+ API Endpoints** fully documented
- **4 External Integrations** (SMS, Voice, Payments, Auth)
- **Production-Ready** with health checks and rate limiting
- **AI-Powered** safety scoring engine
- **Real-time** guardian alerts via SMS
- **Secure** JWT authentication
- **Scalable** database architecture

---

**Need help?** All endpoints are documented in `API_DOCUMENTATION.md`

**Demo Ready!** 🚀
