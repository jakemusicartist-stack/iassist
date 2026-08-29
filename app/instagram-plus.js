/**
 * Iassist - Power User Features
 * Injected as a content script to run alongside the main extension.
 */

(function() {
  'use strict';

  console.log('[Iassist] Initializing Power-User Features...');

  // Configuration for Custom Fonts mapping
  const fonts = {
    bold: { a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷', k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁', u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇' },
    fraktur: { a: '𝔞', b: '𝔟', c: '𝔠', d: '𝔡', e: '𝔢', f: '𝔣', g: '𝔤', h: '𝔥', i: '𝔦', j: '𝔧', k: '𝔨', l: '𝔩', m: '𝔪', n: '𝔫', o: '𝔬', p: '𝔭', q: '𝔮', r: '𝔯', s: '𝔰', t: '𝔱', u: '𝔲', v: '𝔳', w: '𝔴', x: '𝔵', y: '𝔶', z: '𝔷' }
  };

  function applyFont(text, style) {
    const map = fonts[style];
    if (!map) return text;
    return text.split('').map(char => map[char.toLowerCase()] || char).join('');
  }

  // --- Main Loop --- //
  
  function init() {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .plus-btn-premium {
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(0,0,0,0.1);
        color: #007AFF;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        font-size: 16px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        transition: all 0.2s ease;
      }
      .plus-btn-premium:hover {
        background: #007AFF;
        color: white;
        transform: scale(1.05);
      }
      
      /* Custom bio font buttons */
      .plus-font-btn {
        background: transparent;
        border: 1px solid rgba(0,0,0,0.2);
        color: inherit;
        border-radius: 12px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .plus-font-btn:hover {
        background: rgba(0,0,0,0.05);
      }

      /* Deeply Crafted Curves for all posts and grids */
      article {
        border-radius: 24px !important;
        overflow: hidden !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
      }
      
      /* Target profile grid and explore grid items */
      main a[href*="/p/"], main a[href*="/reel/"] {
        border-radius: 12px !important;
        overflow: hidden !important;
      }
      
      /* Ensure inner images respect the curves */
      article img, article video, main a[href*="/p/"] img, main a[href*="/reel/"] img {
        border-radius: inherit !important;
      }
      /* Convert INSSIST Gold Pro Badges to Apple Blue (Injected UI) */
      :root {
        --tw-yellow-400: #007AFF !important;
        --tw-yellow-500: #007AFF !important;
        --tw-amber-400: #007AFF !important;
        --tw-amber-500: #007AFF !important;
      }
      [class*="text-yellow-"], [class*="text-amber-"], [class*="text-orange-"] {
        color: #007AFF !important;
      }
      [class*="bg-yellow-"], [class*="bg-amber-"], [class*="bg-orange-"] {
        background-color: #007AFF !important;
      }
      [class*="border-yellow-"], [class*="border-amber-"], [class*="border-orange-"] {
        border-color: #007AFF !important;
      }
      /* Fallbacks for inline gold styles and SVGs */
      [style*="rgb(251, 192, 45)"], [style*="#FBC02D"], [style*="#fbc02d"],
      [style*="rgb(255, 193, 7)"], [style*="#FFC107"], [style*="#ffc107"],
      [style*="rgb(250, 204, 21)"], [style*="#FACC15"], [style*="#facc15"],
      [style*="rgb(255, 215, 0)"], [style*="#FFD700"], [style*="#ffd700"] {
        border-color: #007AFF !important;
        background-color: #007AFF !important;
        color: #007AFF !important;
      }
      path[fill^="#F"], path[fill^="#f"], path[stroke^="#F"], path[stroke^="#f"],
      circle[fill^="#F"], circle[fill^="#f"], circle[stroke^="#F"], circle[stroke^="#f"] {
         /* Catch stray gold SVGs */
      }
    `;
    document.head.appendChild(styleEl);

    blockTypingIndicators();
    
    const observer = new MutationObserver(() => {
      try { injectProfileTools(); } catch (e) { console.error(e); }
      try { enhanceText(); } catch (e) { console.error(e); }
      try { enhanceVideos(); } catch (e) { console.error(e); }
      try { injectFontWidget(); } catch (e) { console.error(e); }
      try { removeSlashCommandHint(); } catch (e) { console.error(e); }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 1. HD Profile Picture & Downloader (Pinterest style overlay)
  function injectProfileTools() {
    const avatars = document.querySelectorAll('img[alt*="profile picture"]:not([data-plus-hd]), img[alt*="\'s profile picture"]:not([data-plus-hd])');
    avatars.forEach(img => {
      try {
        img.setAttribute('data-plus-hd', 'true');
        
        let wrapper = img.parentElement;
        for (let i = 0; i < 3; i++) {
          if (wrapper && wrapper.parentElement) wrapper = wrapper.parentElement;
        }
        
        if (!wrapper || wrapper.tagName === 'BODY') return;
        
        wrapper.style.position = 'relative';

        const hdBtn = document.createElement('div');
        hdBtn.className = 'plus-btn-premium';
        hdBtn.style.position = 'absolute';
        hdBtn.style.top = '5px';
        hdBtn.style.right = '5px';
        hdBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>`;
        hdBtn.style.display = 'none';
        hdBtn.title = 'Download HD Picture';
        
        wrapper.appendChild(hdBtn);

        wrapper.addEventListener('mouseenter', () => hdBtn.style.display = 'inline-flex');
        wrapper.addEventListener('mouseleave', () => hdBtn.style.display = 'none');

        hdBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = img.src.replace(/\\/g, '');
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `ig_profile_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.error('[Iassist] Download failed, falling back to new tab', err);
            window.open(url, '_blank');
          }
        });
      } catch (err) {
        console.error('[Iassist] Error processing profile picture', err);
      }
    });
  }

  // 2. Clickable Links
  function enhanceText() {
    const texts = document.querySelectorAll('span[dir="auto"]:not([data-plus-text])');
    texts.forEach(el => {
      try {
        if (el.innerText.length < 5) return;
        el.setAttribute('data-plus-text', 'true');
        
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
          textNodes.push(node);
        }
        
        textNodes.forEach(textNode => {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const text = textNode.nodeValue;
          if (!urlRegex.test(text)) return;
          
          urlRegex.lastIndex = 0;
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let match;
          
          while ((match = urlRegex.exec(text)) !== null) {
            const url = match[0];
            const offset = match.index;
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.style.color = '#007AFF';
            a.style.textDecoration = 'underline';
            a.textContent = url;
            fragment.appendChild(a);
            lastIndex = offset + url.length;
          }
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
          textNode.parentNode.replaceChild(fragment, textNode);
        });
      } catch (err) {
        console.error('[Iassist] Error processing text link', err);
      }
    });
  }

  // 3. Video Player Controls
  function enhanceVideos() {
    const videos = document.querySelectorAll('video:not([data-plus-video])');
    videos.forEach(vid => {
      try {
        vid.setAttribute('data-plus-video', 'true');
        vid.controls = true;
        
        const overlay = vid.parentElement.querySelector('div[class*="x1ey2m1c"]');
        if (overlay) {
          overlay.style.pointerEvents = 'none';
        }
      } catch (err) {
        console.error('[Iassist] Error processing video controls', err);
      }
    });
  }

  // 4. Custom Bio Fonts Widget (Robust React implementation)
  function injectFontWidget() {
    const textareas = document.querySelectorAll('textarea:not([data-plus-fonts])');
    textareas.forEach(bioTextarea => {
      try {
        bioTextarea.setAttribute('data-plus-fonts', 'true');
        
        if (bioTextarea.parentElement.querySelector('.plus-font-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'plus-font-toolbar';
        toolbar.style.display = 'inline-flex';
        toolbar.style.gap = '4px';
        toolbar.style.marginRight = '8px';
        toolbar.style.alignItems = 'center';

        ['bold', 'fraktur'].forEach(style => {
          const btn = document.createElement('button');
          btn.className = 'plus-font-btn';
          btn.innerText = style.charAt(0).toUpperCase() + style.slice(1);
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const start = bioTextarea.selectionStart;
            const end = bioTextarea.selectionEnd;
            if (start === end) return;
            
            const selected = bioTextarea.value.substring(start, end);
            const transformed = applyFont(selected, style);
            
            const newValue = bioTextarea.value.substring(0, start) + transformed + bioTextarea.value.substring(end);
            
            // Force React state update by overriding the native input setter
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(bioTextarea, newValue);
            } else {
              bioTextarea.value = newValue;
            }
            
            bioTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          });
          toolbar.appendChild(btn);
        });

        bioTextarea.parentElement.insertBefore(toolbar, bioTextarea);
      } catch (err) {
        console.error('[Iassist] Error injecting font widget', err);
      }
    });
  }

  // 5. Remove INSSIST "/..." DM template hint
  function removeSlashCommandHint() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      try {
        const val = node.nodeValue.trim();
        if (val === '/...' || val.includes('/...')) {
          let parent = node.parentElement;
          while (parent && parent.tagName !== 'BUTTON' && parent.tagName !== 'BODY') {
            parent = parent.parentElement;
          }
          if (parent && parent.tagName === 'BUTTON') {
            parent.style.display = 'none';
          } else {
            node.nodeValue = node.nodeValue.replace('/...', '');
          }
        }
      } catch (err) {
        console.error('[Iassist] Error removing slash command hint', err);
      }
    }
  }

  // --- Network Intercepts --- //

  // Hide Typing Status
  function blockTypingIndicators() {
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(data) {
      if (typeof data === 'string' && data.includes('indicate_activity')) {
        return;
      }
      return originalSend.apply(this, arguments);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
