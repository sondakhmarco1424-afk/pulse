# Pulse - Cryptocurrency Alerts System

Pulse is a full-stack real-time cryptocurrency alerting platform. It allows users to track crypto prices via a Binance WebSocket connection and receive instant native OS push notifications via Firebase Cloud Messaging when their target price crosses a threshold.

## 🚀 Quick Setup (Windows)

We have provided a one-click setup script to get you running immediately.

1. **Run the setup script:**
   Double-click `setup.bat` or run it from your terminal:
   ```cmd
   .\setup.bat
   ```
   This script will automatically:
   - Boot up the required backend infrastructure (MySQL, Redis, Kafka, Zookeeper) using Docker Compose.
   - Install all Frontend Node dependencies.
   - Install all Go backend dependencies.

2. **Configure Firebase Secrets (Required for Push Notifications):**
   - Place your Firebase Admin SDK private key in `internal/config/firebase-service-account.json`. 
   - Ensure your `frontend/firebase-applet-config.json` matches your Firebase project config.
   ![alt text](image.png)


3. **Start the Application:**
   - **Start the Frontend:** Open a terminal and run:
     ```cmd
     cd frontend
     npm run dev
     ```
   - **Start the Backend:** Open a new terminal and run:
     ```cmd
     go run internal/cmd/main.go
     ```

4. **Access the App!**
   Open your browser to `http://localhost:3000`

---

## 🏗️ Manual Setup (If you prefer not to use setup.bat)

### 1. Start Infrastructure (Docker)
Ensure Docker Desktop is running, then run:
```bash
docker-compose -f docker-compose-pulse.yml up -d
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Backend Setup
```bash
go mod tidy
go run internal/cmd/main.go
```

## 🛠️ Tech Stack
- **Frontend:** React, Vite, TailwindCSS, Firebase Web SDK (v9 Modular)
- **Backend:** Go (Gin Framework), Confluent Kafka, Redis, MySQL, Firebase Admin SDK
- **Infrastructure:** Docker, Zookeeper

## 📝 Important Notes
- **FCM Web Push:** For push notifications to successfully route to the web frontend, you MUST access the frontend on `http://localhost:3000` or a secure HTTPS domain.
- **Service Worker:** FCM requires `firebase-messaging-sw.js` in the public root.
