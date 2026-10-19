// Two buttons that fail on purpose, so you can see how celular-dev explains errors.
document.getElementById('error-js').addEventListener('click', () => {
  mostrarRanking();   // this function does not exist
});
document.getElementById('error-red').addEventListener('click', () => {
  const img = document.createElement('img');
  img.alt = 'A picture that is not there';
  img.src = '/img/no-existe.png';   // this file does not exist
  document.getElementById('imagenes').append(img);
});

// A visit counter in localStorage and a cookie, so there is something to look at in the "Site data" tab.
localStorage.setItem('visits', String(Number(localStorage.getItem('visits') || 0) + 1));
document.cookie = 'demo=celular-dev; path=/';
