/* Global Privacy Control: le avisa a cada sitio que no querés que vendan ni compartan tus datos. */
(() => {
  try {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
      get: () => true, configurable: true, enumerable: true,
    });
  } catch {}
})();
