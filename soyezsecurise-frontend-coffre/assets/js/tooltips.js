(function(){
  
  const selector = '.action-hub a';
  const links = Array.from(document.querySelectorAll(selector));
  if(!links.length) return;

  
  const tip = document.createElement('div');
  tip.className = 'tooltip-element';
  tip.setAttribute('role','status');
  tip.setAttribute('aria-hidden','true');
  tip.innerHTML = '<span class="tooltip-title"></span><span class="tooltip-desc"></span>';
  document.body.appendChild(tip);
  const titleEl = tip.querySelector('.tooltip-title');
  const descEl = tip.querySelector('.tooltip-desc');

  let showTimeout = null;

  function showFor(el){
    const raw = el.getAttribute('data-tooltip') || el.getAttribute('title') || '';
    if(!raw) return;
    
    let t = raw;
    let d = '';
    const sepIdx = Math.max(raw.indexOf(':') , raw.indexOf('.'));
    if(sepIdx>0 && sepIdx < 60){
      t = raw.substring(0, sepIdx+1).trim();
      d = raw.substring(sepIdx+1).trim();
    } else if(raw.length>60){
      t = raw.split(' ').slice(0,6).join(' ') + '…';
      d = raw;
    } else {
      d = '';
    }

    titleEl.textContent = t;
    descEl.textContent = d;

    
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    
    let top = rect.top + window.scrollY - tipRect.height - 10;
    if(top < 8) top = rect.bottom + window.scrollY + 8;
    
    if(left + tipRect.width > window.innerWidth - 12) {
      left = window.innerWidth - tipRect.width - 12;
    }
    tip.style.left = (left) + 'px';
    tip.style.top = (top) + 'px';

    tip.classList.add('visible');
    tip.setAttribute('aria-hidden','false');
  }

  function hide(){
    tip.classList.remove('visible');
    tip.setAttribute('aria-hidden','true');
  }

  links.forEach(link => {
    
    const t = link.getAttribute('title');
    if(t){
      link.setAttribute('data-tooltip', t);
      link.removeAttribute('title');
    }

    link.addEventListener('mouseenter', (e)=>{
      clearTimeout(showTimeout);
      showTimeout = setTimeout(()=> showFor(link), 150);
    });
    link.addEventListener('mouseleave', ()=>{
      clearTimeout(showTimeout);
      hide();
    });
    link.addEventListener('focus', ()=>{
      showFor(link);
    });
    link.addEventListener('blur', ()=>{
      hide();
    });
  });

  
  window.addEventListener('scroll', hide, {passive:true});
  window.addEventListener('resize', hide);
})();
