# Deployment Guide: GitHub & Azure

## 1. Push to GitHub

Since you already have a local Git repository, follow these steps to push it to GitHub.

1.  **Create a new repository on GitHub**:
    *   Go to [github.com/new](https://github.com/new).
    *   Name it `ryanair-finder` (or whatever you prefer).
    *   **Do not** initialize with README, .gitignore, or license (you already have these).
    *   Click **Create repository**.

2.  **Connect your local repo to GitHub**:
    Run these commands in your terminal:

    ```bash
    # Add the remote repository (replace YOUR_USERNAME with your actual GitHub username)
    git remote add origin https://github.com/YOUR_USERNAME/ryanair-finder.git

    # Rename the main branch to 'main' if it isn't already
    git branch -M main

    # Stage all your changes
    git add .

    # Commit your changes
    git commit -m "Ready for deployment"

    # Push to GitHub
    git push -u origin main
    ```

## 2. Deploy to Azure App Service

The easiest way to deploy a Next.js app with API routes is using **Azure App Service**.

1.  **Create a Web App**:
    *   Log in to the [Azure Portal](https://portal.azure.com).
    *   Search for **"App Services"** and click **Create** > **Web App**.
    *   **Subscription**: Select your subscription.
    *   **Resource Group**: Create a new one (e.g., `rg-ryanair-finder`).
    *   **Name**: Choose a unique name (e.g., `ryanair-finder-app`).
    *   **Publish**: Select **Code**.
    *   **Runtime stack**: Select **Node 20 LTS** (or the latest LTS available).
    *   **Operating System**: **Linux** is recommended for Node.js apps.
    *   **Region**: Choose a region close to you (e.g., `West Europe`).
    *   **Pricing Plan**: Select a plan (The **Free F1** tier is great for testing, or **Basic B1** for better performance).
    *   Click **Review + create** and then **Create**.

2.  **Configure Deployment**:
    *   Once the resource is created, go to the resource page.
    *   In the left menu, look for **Deployment** > **Deployment Center**.
    *   **Source**: Select **GitHub**.
    *   **Authorize**: Sign in to your GitHub account if asked.
    *   **Organization**: Select your GitHub username.
    *   **Repository**: Select `ryanair-finder`.
    *   **Branch**: Select `main`.
    *   Click **Save**.

    Azure will automatically create a GitHub Actions workflow in your repository and start building/deploying your app.

3.  **Configure Environment Variables**:
    *   In the App Service left menu, go to **Settings** > **Environment variables**.
    *   Add any environment variables you use locally (e.g., if you have API keys).
    *   **Important**: Set `SCM_DO_BUILD_DURING_DEPLOYMENT` to `true` to ensure the build happens on the server.
    *   Click **Apply** and **Confirm**.

4.  **Verify Deployment**:
    *   Go to the **Overview** tab.
    *   Click the **Default domain** URL (e.g., `https://ryanair-finder-app.azurewebsites.net`).
    *   Your app should be live! 🚀

## Troubleshooting

*   **Build Failures**: Check the "Actions" tab in your GitHub repository to see build logs.
*   **Application Error**: If you see an error page, go to **Log Stream** in the Azure App Service menu to see real-time server logs.
