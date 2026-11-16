/* The gallery page: start the kit, and wire the motion demos. */
(function () {
  'use strict';
  Paint.init();

  var target = document.querySelector('.gal-target');
  document.querySelector('.gal-replay').addEventListener('click', function () {
    // restart the reveal: take the class off, let the browser notice, put it back
    target.classList.remove('pt-reveal'); void target.offsetWidth; target.classList.add('pt-reveal');
  });
  document.querySelector('.gal-ink').addEventListener('click', function () { Paint.ink(target, '#15131c'); });
  document.querySelector('.gal-toast').addEventListener('click', function () { Paint.toast('Saved to your Liked Songs.', { color: 'green' }); });

  var wetBtn = document.querySelector('.gal-wet'), drip = document.querySelector('.gal-drip');
  wetBtn.addEventListener('click', function () {
    var on = wetBtn.getAttribute('aria-pressed') !== 'true';
    wetBtn.setAttribute('aria-pressed', String(on));
    wetBtn.textContent = on ? 'Wet paint: on' : 'Wet paint: off';
    Paint.wet(drip, on);
  });

  // the chips act as one group
  Array.prototype.forEach.call(document.querySelectorAll('.pt-chip'), function (chip, i, all) {
    chip.addEventListener('click', function () { Array.prototype.forEach.call(all, function (c) { c.setAttribute('aria-pressed', String(c === chip)); }); });
  });
})();
