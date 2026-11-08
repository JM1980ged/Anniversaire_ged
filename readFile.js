import { decodeBytes } from './gedcom';

function readBytes(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.response) resolve(new Uint8Array(xhr.response));
      else reject(new Error('Fichier vide'));
    };
    xhr.onerror = () => reject(new Error('Lecture impossible'));
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', uri);
    xhr.send(null);
  });
}

// Lit un fichier local (file:// ou content://) et renvoie son texte.
export async function readGedFile(uri) {
  try {
    return decodeBytes(await readBytes(uri));
  } catch (e) {
    const res = await fetch(uri);
    return await res.text();
  }
}
