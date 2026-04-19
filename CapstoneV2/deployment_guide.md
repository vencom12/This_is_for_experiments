# Stitch-Opt Live Web Deployment Guide

Since you've built a full-pledged Node.js, Express, and MongoDB app, you're ready to "go live." Follow these steps to take your project from localhost to the real internet.

---

## Step 1: Cloud Database (MongoDB Atlas)

Since your current database is on your PC, it won't be accessible once you host your site on the cloud. You need a "forever-on" database.

1.  **Sign up**: Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/lp/try81) and create a free account.
2.  **Create a Cluster**: Choose the **FREE (M0)** tier. Select a provider (like AWS or Google Cloud) and a region near you.
3.  **Create a Database User**: Set a username and a strong password (you'll need these later).
4.  **Network Access**: For testing, allow access from **0.0.0.0/0** (everywhere). For production, only your hosting's IP is safer, but "0.0.0.0/0" is fine for now.
5.  **Get Connnect Link**: Click "Connect" -> "Drivers" -> "Node.js". Copy the connection string.
    - It will look like: `mongodb+srv://<db_username>:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
    - Replace `<db_password>` with your actual password.

---

## Step 2: Hosting (Render.com)

Render is great because it handles HTTPS automatically and is built specifically for Node.js projects like yours.

1.  **Sign up**: Go to [Render.com](https://render.com/) and create a free account (connect via GitHub/GitLab if possible).
2.  **Create a "Web Service"**: Choose "New" -> "Web Service".
3.  **Connect your Repo**: Connect the GitHub repository where you uploaded your code.
4.  **Settings**:
    - **Runtime**: `Node`
    - **Build Command**: `npm install`
    - **Start Command**: `npm start` (The one I just added to your `package.json`).
5.  **Environment Variables**: This is the most important part. Click "Environment" and add:
    - **`MONGODB_URI`**: The connection string you got from MongoDB Atlas.
    - **`JWT_SECRET`**: A long, random string (e.g., `StitchOpt-Security-Super-Secret-2024`).
    - **`NODE_ENV`**: `production`
6.  **Deploy**: Click "Create Web Service". Render will spend a few minutes installing your packages and starting the server.

---

## Step 3: Going Live

Once Render says "Live ✅", it will give you a URL like `https://stitchmaster-ai.onrender.com`.

1.  **Verify**: Visit that URL. Your login screen should appear!
2.  **Register**: Try creating a new account. It will now save to your Cloud database instead of your local one.
3.  **PWA**: If you open this URL on your phone or Android, the "Install" prompt will appear because we've perfectly configured your `manifest.json` and `sw.js`.

---

## ⚠️ Important for Deployment

> [!IMPORTANT]
> **Production vs. Development**: Always keep your local `.env` file secret. Never upload it to GitHub. Instead, use the **Environment Variables** panel on Render to set your production settings.

> [!TIP]
> Since you're using **Socket.IO** for real-time updates (like your `io.emit` calls in `server.js`), Render might occasionally delay messages on their free tier if the app "goes to sleep." If your capstone requires 100% constant connection, consider their "Starter" tier or Railway.io!

**Good luck with your "Full Web" launch!** 🚀
