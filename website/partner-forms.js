// Shared Franchise / Vendor application submit handler.
// Used by BOTH index.html and services.html so every form sends its data to the
// backend, where the admin panel (dashboard) loads it from.

// Backend address. Same server when the backend serves this site; falls back to
// localhost:8080 when the page is opened as a file or through Live Server.
// To point at a deployed backend, set window.OTW_API_BASE before this script loads.
const OTW_API_BASE = window.OTW_API_BASE || ((location.protocol === 'file:' || ['5500', '5501'].includes(location.port)) ? 'http://localhost:8080' : location.origin);

async function handlePortalSubmit(e, portalType) {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.submitting === 'true') return;
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
  const originalHtml = submitButton ? submitButton.innerHTML : '';
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Submitting…'; }
  form.dataset.submitting = 'true';

  const data = Object.fromEntries(new FormData(form).entries());
  // The area dropdown's value is "Post office|PIN"; keep only the area name (PIN has its own field).
  if (typeof data.location === 'string') data.location = data.location.split('|')[0].trim();
  const storageKey = portalType === 'Franchise' ? 'otw_franchise_applications' : 'otw_vendor_applications';
  try {
    // 1. Send to the backend so it appears in the admin panel
    //    (Client > Franchise / Vendor and Partner Applications).
    const res = await fetch(OTW_API_BASE + '/api/partner-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, type: portalType, portalType })
    });
    if (!res.ok) throw new Error('Server responded ' + res.status);
    const saved = (await res.json()).application || {};
    const applicationId = saved.appId;
    if (!applicationId) throw new Error('No application ID returned');

    // 2. Keep a copy in this browser so the applicant can see the confirmation page.
    const application = { ...data, portalType, applicationId, submittedAt: saved.submittedAt || new Date().toISOString() };
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_) {}
    if (!Array.isArray(existing)) existing = [];
    existing.push(application);
    try {
      localStorage.setItem(storageKey, JSON.stringify(existing));
      localStorage.setItem('otw_last_application_id', applicationId);
    } catch (_) {}
    window.location.href = 'application-details.html?id=' + encodeURIComponent(applicationId);
  } catch (err) {
    console.error('Application submit failed:', err);
    form.dataset.submitting = 'false';
    if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalHtml || 'Submit Application'; }
    let notification = document.getElementById('statusNotification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'statusNotification';
      form.prepend(notification);
    }
    notification.setAttribute('role', 'alert');
    notification.textContent = 'We could not submit your application right now. Your entered information is still on this page. Please check your connection and try again.';
    notification.style.cssText = 'display:block;padding:12px 16px;margin-bottom:16px;background:#fff1f0;color:#9b1c1c;border:1px solid #f5b7b1;border-radius:8px;';
    notification.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
