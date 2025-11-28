# Azure Deployment Troubleshooting

## Check Application Logs

1. Go to Azure Portal → Your App Service (rffapp)
2. In the left menu, go to **Monitoring** → **Log stream**
3. Wait for logs to appear - you should see:
   - npm install output
   - npm run build output
   - npm start output
   - Server startup message: "Ready on http://0.0.0.0:PORT"

## Common Issues and Fixes

### Issue 1: Application Error
**Symptoms**: White page with ":( Application Error"

**Possible Causes**:
1. **Port binding issue**: Server not listening on Azure's PORT
2. **Missing dependencies**: node_modules not installed
3. **Build failure**: Next.js build failed
4. **Startup command wrong**: Azure can't find the start script

**Check**:
- Log stream for errors
- Configuration → General Settings → Startup Command should be: `npm start`
- Configuration → Application Settings → Add `WEBSITE_NODE_DEFAULT_VERSION` = `20-lts`

### Issue 2: Build Failures
**Check GitHub Actions**:
1. Go to your GitHub repo → Actions tab
2. Click on the latest workflow run
3. Check for any red X marks indicating failures

### Issue 3: Dependencies Not Installing
**Solution**:
1. In Azure Portal → Configuration → Application Settings
2. Add new setting:
   - Name: `SCM_DO_BUILD_DURING_DEPLOYMENT`
   - Value: `true`
3. Click Save

## Manual Deployment Test

If automated deployment keeps failing, try manual deployment:

```bash
# In your local project directory
npm install
npm run build

# Install Azure CLI if you haven't
# brew install azure-cli  # macOS
# or download from https://aka.ms/installazurecliwindows

# Login to Azure
az login

# Deploy
az webapp up --name rffapp --resource-group <your-resource-group> --runtime "NODE:20-lts"
```

## Check Configuration

Run these commands in Azure Cloud Shell or locally with Azure CLI:

```bash
# Check app settings
az webapp config appsettings list --name rffapp --resource-group <your-rg>

# Check startup command
az webapp config show --name rffapp --resource-group <your-rg> --query "appCommandLine"

# View recent logs
az webapp log tail --name rffapp --resource-group <your-rg>
```

## What Should Work

After successful deployment, you should see in Log Stream:
```
> ryanair-finder@0.1.0 start
> node server.js

> Ready on http://0.0.0.0:8080
```

The port number (8080 or similar) will be assigned by Azure.
