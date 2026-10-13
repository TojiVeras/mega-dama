// Lista clicável da playlist/mix que está tocando (modo teatro do painel de música).
// A IFrame API só entrega os ids dos vídeos: a miniatura vem de i.ytimg.com e o título do
// oEmbed do YouTube (público, sem chave), buscado aos poucos.

const OEMBED = 'https://www.youtube.com/oembed?format=json&url=';
const PARALLEL = 4;

async function fetchTitle(id) {
  const res = await fetch(OEMBED + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`));
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);
  return (await res.json()).title;
}

export class PlaylistView {
  /** `element`: contêiner da lista; `onPick(index)`: clique em uma música. */
  constructor(element, { onPick }) {
    this.element = element;
    this.onPick = onPick;
    this.ids = [];
    this.rows = [];
    this.current = -1;
    this.titles = new Map(); // videoId -> título (vale para a sessão toda)
    this.queue = [];
    this.running = 0;

    element.addEventListener('click', (e) => {
      const row = e.target.closest('button[data-index]');
      if (row) this.onPick(Number(row.dataset.index));
    });
  }

  /** Recria a lista se os vídeos mudaram. */
  setItems(ids) {
    if (ids.length === this.ids.length && ids.every((id, i) => id === this.ids[i])) return;
    this.ids = [...ids];
    this.current = -1;
    this.rows = this.ids.map((id, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.index = i;
      const number = document.createElement('span');
      number.className = 'num';
      number.textContent = i + 1;
      const thumb = document.createElement('img');
      thumb.loading = 'lazy';
      thumb.alt = '';
      thumb.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = this.titles.get(id) ?? `Faixa ${i + 1}`;
      row.append(number, thumb, title);
      row.titleEl = title;
      return row;
    });
    this.element.replaceChildren(...this.rows);
    this.element.classList.toggle('empty', !this.rows.length);
    this.queue = [...new Set(this.ids)].filter((id) => !this.titles.has(id));
    this.#pump();
  }

  /** Destaca a música que está tocando e rola a lista até ela. */
  setCurrent(index) {
    if (index === this.current) return;
    this.rows[this.current]?.removeAttribute('aria-current');
    this.current = index;
    const row = this.rows[index];
    if (!row) return;
    row.setAttribute('aria-current', 'true');
    this.reveal();
  }

  /** Rola a lista (só ela, não a página) até a música atual. */
  reveal() {
    const row = this.rows[this.current];
    if (!row) return;
    const list = this.element; // position: relative, então offsetTop é relativo à lista
    if (!list.clientHeight) return; // lista escondida (fora do modo teatro)
    const top = row.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + row.offsetHeight - list.clientHeight;
    }
  }

  setTitle(id, title) {
    if (!id || !title || this.titles.get(id) === title) return;
    this.titles.set(id, title);
    this.ids.forEach((other, i) => {
      if (other === id) this.rows[i].titleEl.textContent = title;
    });
  }

  #pump() {
    while (this.running < PARALLEL && this.queue.length) {
      const id = this.queue.shift();
      if (this.titles.has(id)) continue;
      this.running++;
      fetchTitle(id)
        .then((title) => this.setTitle(id, title))
        .catch(() => {}) // sem título (vídeo privado, sem rede): fica "Faixa N"
        .finally(() => {
          this.running--;
          this.#pump();
        });
    }
  }
}
