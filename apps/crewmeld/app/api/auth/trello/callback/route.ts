import { type NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/core/utils/urls'

export const dynamic = 'force-dynamic'

/** Trello redirects here with the token in the URL fragment — a client-side page reads it. */
export async function GET(_request: NextRequest) {
  const baseUrl = getBaseUrl()

  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Connecting to Trello...</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        background: linear-gradient(135deg, #0052CC 0%, #0079BF 100%);
      }
      .container {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 400px;
      }
      .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #0052CC;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      h2 { color: #111827; margin: 0 0 0.5rem 0; }
      p { color: #6b7280; margin: 0; }
      .error { color: #ef4444; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="spinner"></div>
      <h2>Connecting to Trello</h2>
      <p id="status">Processing authorization...</p>
      <p id="error" class="error" style="display:none;"></p>
    </div>

    <script>
      (function() {
        var statusEl = document.getElementById('status');
        var errorEl = document.getElementById('error');

        function showError(msg, redirectError) {
          errorEl.textContent = msg;
          errorEl.style.display = 'block';
          statusEl.textContent = 'Connection failed';
          setTimeout(function() {
            window.location.href = '${baseUrl}/workspace?error=' + redirectError;
          }, 3000);
        }

        try {
          var fragment = window.location.hash.substring(1);
          var params = new URLSearchParams(fragment);
          var token = params.get('token');

          if (!token) {
            throw new Error('No token received from Trello');
          }

          statusEl.textContent = 'Saving your connection...';

          fetch('${baseUrl}/api/auth/trello/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: token })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.success) {
              statusEl.textContent = 'Success! Redirecting...';
              setTimeout(function() {
                window.location.href = '${baseUrl}/workspace?trello_connected=true';
              }, 500);
            } else {
              showError(data.error || 'Failed to save connection', 'trello_failed');
            }
          })
          .catch(function(err) {
            showError(err.message || 'Failed to save connection', 'trello_failed');
          });

        } catch (err) {
          showError(err.message || 'Authorization failed', 'trello_auth_failed');
        }
      })();
    </script>
  </body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
