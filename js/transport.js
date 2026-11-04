'use strict';

// POST melalui form/iframe memungkinkan pembacaan respons tanpa no-cors.
// Seluruh payload, termasuk password dan sesi, dikirim di badan POST.
window.HealthyVibesApi = (function () {
  const protocol = 'healthyvibes-api-v1';

  // Terima hanya asal respons HTML Service, bukan pesan dari situs sembarang.
  function isGoogleOrigin(origin) {
    return /^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+-script|script)\.googleusercontent\.com)$/
      .test(origin);
  }

  // Memeriksa bahwa pengirim balasan berasal dari iframe permintaan, termasuk iframe bersarang.
  function belongsToFrame(source, frame) {
    try {
      for (let depth = 0; source && depth < 8; depth += 1) {
        if (source === frame.contentWindow) {
          return true;
        }
        const parent = source.parent;
        if (parent === source) {
          break;
        }
        source = parent;
      }
    } catch {
      return false;
    }
    return false;
  }

  // Kanal acak menghubungkan satu balasan dengan satu request saja.
  function createChannel() {
    return Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      function (byte) {
        return byte.toString(16).padStart(2, '0');
      }
    ).join('');
  }

  // Mengirim data lewat form POST dan menunggu balasan Google yang cocok dengan permintaan.
  function request(payload) {
    return new Promise(function (resolve, reject) {
      const config = window.HV_CONFIG || {};
      const endpoint = String(config.apiUrl || '').trim();

      if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/
        .test(endpoint)) {
        reject(new Error('Isi URL API Apps Script /exec pada js/config.js.'));
        return;
      }
      if (location.origin === 'null' || window.top !== window.self) {
        reject(new Error('Buka aplikasi langsung melalui URL HTTPS atau server lokal.'));
        return;
      }

      const channel = createChannel();
      const frame = document.createElement('iframe');
      const form = document.createElement('form');
      let timer;
      let finished = false;

      // Elemen ini aktif untuk komunikasi API, bukan konten UI tersembunyi.
      frame.name = 'hv-api-' + channel;
      frame.title = 'Penghubung API Healthy Vibes';
      frame.hidden = true;
      frame.referrerPolicy = 'no-referrer';
      form.hidden = true;
      form.method = 'POST';
      form.action = endpoint;
      form.target = frame.name;
      form.acceptCharset = 'UTF-8';

      const fields = {
        clientOrigin: location.origin,
        channel: channel,
        payload: JSON.stringify(payload)
      };

      Object.entries(fields).forEach(function (entry) {
        const input = document.createElement('textarea');
        input.name = entry[0];
        input.value = entry[1];
        form.appendChild(input);
      });

      // Bersihkan listener, timer, dan payload setelah sukses maupun gagal.
      function finish(error, response) {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        Array.from(form.elements).forEach(function (input) {
          input.value = '';
        });
        form.remove();
        frame.remove();
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      }

      // Asal Google, hubungan iframe, dan kanal harus cocok sekaligus.
      function receive(event) {
        const message = event.data;
        if (
          !isGoogleOrigin(event.origin) ||
          !belongsToFrame(event.source, frame) ||
          !message ||
          message.protocol !== protocol ||
          message.channel !== channel
        ) {
          return;
        }
        if (!message.response || typeof message.response.ok !== 'boolean') {
          finish(new Error('Respons server tidak valid; keberhasilan belum dipastikan.'));
          return;
        }
        finish(null, message.response);
      }

      const longOperation = ['backup', 'restoreStaging'].includes(payload.action);
      const configuredTimeout = Number(
        longOperation ? config.longRequestTimeoutMs : config.requestTimeoutMs
      );
      const timeout = Number.isFinite(configuredTimeout) && configuredTimeout >= 5000
        ? Math.min(configuredTimeout, 480000)
        : longOperation ? 420000 : 180000;

      window.addEventListener('message', receive);
      timer = setTimeout(function () {
        finish(new Error(
          'Server belum mengonfirmasi hasil. Jangan buat pesanan baru; ' +
          'ulangi dengan ID permintaan yang sama atau periksa status pesanan.'
        ));
      }, timeout);

      try {
        document.body.appendChild(frame);
        document.body.appendChild(form);
        // Submit native tidak memicu handler checkout milik aplikasi.
        HTMLFormElement.prototype.submit.call(form);
      } catch {
        finish(new Error('Request tidak dapat dikirim ke backend Google.'));
      }
    });
  }

  return Object.freeze({ request: request });
})();
