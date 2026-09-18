# 🚀 How to Deploy Your Animebook Web App

Your anime logbook is completely self-contained with no build steps or backend servers required. That means you can deploy it online for **free** with your own live URL in less than 60 seconds!

Here are the 3 best options:

---

## 🥇 Option 1: Netlify Drop (Fastest & Zero Setup — 30 Seconds)

No account needed initially, zero terminal commands:

1. Open your browser and go to: **[https://app.netlify.com/drop](https://app.netlify.com/drop)**
2. Drag and drop your `animebook` folder (`c:\Users\odunn\Documents\FnO\animebook`) straight into the browser window.
3. Netlify will immediately upload it and give you a live HTTPS link (e.g. `https://peaceful-naruto-animebook.netlify.app`)!
4. *(Optional)* Sign up for a free Netlify account to change your site name to something custom like `my-animebook.netlify.app` or attach your own domain.

---

## 🥈 Option 2: Vercel (Fast & Professional)

1. Go to **[https://vercel.com](https://vercel.com)** and sign up/log in (free).
2. Click **"Add New Project"**.
3. You can either:
   - Drag & drop your `animebook` folder directly, OR
   - Connect it to a GitHub repository.
4. Click **Deploy**. Vercel will detect `vercel.json` and publish it instantly with global CDN acceleration and free SSL!

---

## 🥉 Option 3: GitHub Pages (Free Permanent Hosting)

If you want your code safely stored in GitHub and hosted directly:

1. Go to **[https://github.com/new](https://github.com/new)** and create a new repository (e.g. `animebook`).
2. Click **"uploading an existing file"** in the repository page.
3. Drag all files from `animebook` (`index.html`, `style.css`, `app.js`, `assets/`, etc.) and click **Commit changes**.
4. In your GitHub repo, go to **Settings** > **Pages** (in the left sidebar).
5. Under **Build and deployment** > **Branch**, select `main` and `/ (root)`, then click **Save**.
6. Within 1 minute, your site will be live at:
   `https://<your-username>.github.io/animebook/`

---

## ☁️ Option 4: Cloudflare Pages

1. Go to **[https://pages.cloudflare.com/](https://pages.cloudflare.com/)**.
2. Select **Direct Upload** (drag and drop the `animebook` folder).
3. Your site gets deployed globally on Cloudflare's high-speed network with unlimited bandwidth.

---

### 💡 Good to Know
- **Data Persistence**: When hosted on the web, your anime notes and ratings save to your browser's `localStorage` on that specific device/browser.
- **Sync across devices**: You can click **💾 Backup** on your desktop to export your JSON file, then open your deployed URL on your phone or tablet and click **📥 Restore** to instantly load all your anime!
