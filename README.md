# ThreadFlow Server - Backend API 🚀

Backend API server for ThreadFlow - A garment factory management platform handling authentication, products, orders,contacts, and payments.

## ✨ Features

- 🔐 Firebase Admin Authentication with JWT
- 🛡️ Role-Based Access Control (Admin, Manager, Buyer)
- 📦 Product Management CRUD
- 🛒 Complete Order Processing
- 💳 Stripe Payment Integration
- 🚦 Rate Limiting & Security
- 📊 Multi-stage Order Tracking

## 🚀 Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js 5.2.1
- **Database:** MongoDB 7.0.0
- **Auth:** Firebase Admin 13.6.0
- **Payment:** Stripe 20.0.0
- **Security:** CORS, Rate Limit

## ⚙️ Installation

```bash
# Clone repository
git clone https://github.com/Samioul51/threadflow-server.git
cd threadflow-server

# Install dependencies
npm install

# Create .env file
touch .env

# Start server
nodemon index.js
```

## 🔐 Environment Variables

Create `.env` file:

```env
# MongoDB Credentials
user_name=your_mongodb_username
password=your_mongodb_password

# Stripe Secret Key
stripe_secret_key=sk_test_your_stripe_key

## 🔒 Security

- ✅ Firebase JWT verification
- ✅ Role-based middleware
- ✅ CORS with whitelist
- ✅ Rate limiting for Contact Form (1/10min)
- ✅ Input validation

## 👨‍💻 Developer

**A. K. M Samioul Islam**
- GitHub: [@Samioul51](https://github.com/Samioul51/)
- LinkedIn: [A. K. M Samioul Islam](https://www.linkedin.com/in/a-k-m-samioul-islam/)
- Portfolio: [akm-samioul-islam.vercel.app](https://akm-samioul-islam.vercel.app/)

## 🔗 Links

- **Client Repository:** [ThreadFlow Client](https://github.com/Samioul51/ThreadFlow-Client)
