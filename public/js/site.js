/* 前台交互：Banner 轮播 + 询盘表单提交 + 地区/语言切换 */
(function () {
  /* 地区 / 语言切换下拉 */
  var ls = document.querySelector('.lang-switch');
  if (ls) {
    var btn = ls.querySelector('#langBtn');
    var menu = ls.querySelector('#langMenu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = ls.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!ls.contains(e.target)) {
        ls.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    /* 手动切换语言时写入 cookie（记忆 1 年），下次访问自动沿用 */
    menu.querySelectorAll('a[data-setlang]').forEach(function (a) {
      a.addEventListener('click', function () {
        document.cookie = 'lang=' + a.getAttribute('data-setlang') +
          '; path=/; max-age=31536000; samesite=lax';
      });
    });
  }

  /* Banner 轮播 */
  var rot = document.getElementById('rotator');
  if (rot) {
    var slides = rot.querySelectorAll('.banner-slide');
    var i = 0;
    if (slides.length > 1) {
      setInterval(function () {
        slides[i].classList.remove('on');
        i = (i + 1) % slides.length;
        slides[i].classList.add('on');
      }, 4200);
    }
  }

  /* 询盘表单 */
  var form = document.getElementById('inquiryForm');
  if (form) {
    var msg = document.getElementById('formMsg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (!data.name || !data.email) {
        msg.className = 'form-msg err';
        msg.textContent = form.dataset.req || '请填写必填项 / Please fill in required fields';
        return;
      }
      msg.className = 'form-msg';
      msg.textContent = '…';
      fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.ok) {
            msg.className = 'form-msg ok';
            msg.textContent = form.dataset.ok || '提交成功！我们会尽快与您联系。';
            form.reset();
          } else {
            msg.className = 'form-msg err';
            msg.textContent = form.dataset.fail || '提交失败，请稍后重试';
          }
        })
        .catch(function () {
          msg.className = 'form-msg err';
          msg.textContent = form.dataset.fail || '提交失败，请稍后重试';
        });
    });
  }
})();
