
// Replay the Home button's 3D top-to-bottom animation on every click.
const homeButton = document.querySelector('.navlinks .nav-home');
if (homeButton) {
  homeButton.addEventListener('click', () => {
    homeButton.classList.remove('home-button-sequence');
    // Force a style/layout refresh so the CSS animation can restart reliably.
    void homeButton.offsetWidth;
    homeButton.classList.add('home-button-sequence');
  });
}

const menuBtn=document.querySelector('.menu-btn');
const nav=document.querySelector('.nav');
menuBtn?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuBtn.setAttribute('aria-expanded',open);});
document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

const form=document.getElementById('partnerForm');
const note=document.getElementById('formNote');
form.addEventListener('submit',(e)=>{
  e.preventDefault();
  if(!form.checkValidity()){form.reportValidity();return;}
  const data=Object.fromEntries(new FormData(form).entries());
  localStorage.setItem('onTheWayPartnerApplication',JSON.stringify({...data,submittedAt:new Date().toISOString()}));
  note.textContent='Application submitted successfully. Our team will contact you soon.';
  form.reset();
});

// Trigger service entrance effects when the section enters the viewport.
const servicesSection = document.getElementById('services');
if (servicesSection && 'IntersectionObserver' in window) {
  const servicesObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        servicesSection.classList.add('is-visible');
        servicesObserver.unobserve(servicesSection);
      }
    });
  }, { threshold: 0.14 });
  servicesObserver.observe(servicesSection);
} else if (servicesSection) {
  servicesSection.classList.add('is-visible');
}
