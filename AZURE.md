# Azure

How RFF runs on Azure, and what to check when something goes wrong.

## Setup

| | |
|---|---|
| App | Web App `rffapp` (Linux), https://rffapp.azurewebsites.net, custom domain https://rff.fvcloud.eu |
| Resource group | `RG-Azure-RVE-RFF`, subscription "FV Partner Credit MAIN", Sweden Central |
| Plan | `ASP-RGAzureRVERFF-9321`, Basic B2 (no deployment slots, so each deploy restarts the app) |
| Runtime | `NODE\|24-lts` (Node 24, supported until April 2028) |
| Startup command | `PORT=8080 node server.js` (Next.js standalone server) |
| Always On | On, so the app isn't unloaded when idle |
| Security | HTTPS only, TLS 1.2 minimum, FTP and basic-auth publishing off |
| Monitoring | Application Insights `rffapp`; container logs kept 3 days |

There are no secrets in the repository or in GitHub. GitHub Actions signs in to Azure with OpenID Connect
(federated credentials that trust only the `main` branch); the GitHub secrets hold only the client, tenant and
subscription IDs.

## Deploying

Merging to `main` deploys (`.github/workflows/main_rffapp.yml`):

1. Lint, type check, tests and `npm audit` must pass, then `next build` makes a standalone build.
2. The build is zipped and deployed with `azure/webapps-deploy` (the app runs from the package).
3. The run waits until `/api/health` reports the new commit, and fails if it doesn't within 10 minutes.

Deploys run one at a time. Don't deploy by hand (`az webapp up` or zip uploads): that skips the checks and the
next merge would overwrite it anyway. To go back to an earlier version, see "Rolling back" in the README.

## When something is wrong

1. **Is it up, and which version?** `https://rffapp.azurewebsites.net/api/health` shows the commit, uptime and
   recent requests to Ryanair. `"status": "paused"` (HTTP 503) means Ryanair refused requests and the app is
   waiting a minute before asking again; searches say "Ryanair isn't answering" meanwhile.
2. **Did the deploy work?** GitHub → Actions → the latest "Build and deploy" run. The last step shows when the
   new version went live.
3. **Logs**: Azure Portal → `rffapp` → Monitoring → Log stream, or download the last 3 days:

   ```bash
   az webapp log download --name rffapp --resource-group RG-Azure-RVE-RFF
   ```

   The app logs failed Ryanair requests, when it pauses them, and (once per start) which headers it uses to
   tell visitors apart.
4. **Settings**:

   ```bash
   az webapp config show --name rffapp --resource-group RG-Azure-RVE-RFF --query "{runtime:linuxFxVersion, startup:appCommandLine, alwaysOn:alwaysOn}"
   ```

   Expect `NODE|24-lts`, `PORT=8080 node server.js` and `true`.
5. **Restart** (only if it's stuck): Azure Portal → `rffapp` → Overview → Restart. Searches fail for a minute or two.
