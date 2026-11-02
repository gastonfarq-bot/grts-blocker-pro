/* Respaldo para YouTube: si igual aparece un anuncio de video, se adelanta y se saltea. */
(() => {
  if (window.top !== window) return;
  const tick = () => {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;
    const ad = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
    const video = player.querySelector('video');
    if (ad && video) {
      video.muted = true;
      if (isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
      try { video.playbackRate = 16; } catch {}
    }
    for (const b of document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button[id^="skip-button"]')) b.click();
  };
  setInterval(tick, 300);
})();
