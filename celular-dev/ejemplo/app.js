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
