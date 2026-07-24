const supabaseCliente = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const PESO_BAG_UNITARIO = 4;
const KG_POR_SACO = 60;

function formatarNumero(valor, casas = 2) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarData(dataIso) {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/* ---------- Peso dos bags (formulário de novo registro) ---------- */

let pesosBags = [];

function renderListaBags() {
  const lista = document.getElementById("lista-bags");
  lista.innerHTML = pesosBags
    .map(
      (peso, i) => `
      <div class="linha-bag">
        <span class="linha-bag-numero">Bag ${i + 1}</span>
        <input type="number" step="0.001" min="0" value="${peso}" data-indice="${i}" class="input-peso-bag" />
        <button type="button" class="btn-remover-bag" data-indice="${i}" aria-label="Remover bag">×</button>
      </div>`
    )
    .join("");
  atualizarResumoLote();
}

function atualizarResumoLote() {
  const qtdBags = pesosBags.length;
  const somaBags = pesosBags.reduce((soma, p) => soma + (Number(p) || 0), 0);
  const pesoBag = qtdBags * PESO_BAG_UNITARIO;
  const pesoArmazem = somaBags - pesoBag;
  const qtdSacos = pesoArmazem / KG_POR_SACO;

  document.getElementById("resumo-qtd-bags").textContent = qtdBags;
  document.getElementById("resumo-peso-armazem").textContent = formatarNumero(pesoArmazem, 3);
  document.getElementById("resumo-peso-bag").textContent = formatarNumero(pesoBag, 2);
  document.getElementById("resumo-qtd-sacos").textContent = formatarNumero(qtdSacos, 2);
}

document.getElementById("btn-add-bag").addEventListener("click", () => {
  pesosBags.push(0);
  renderListaBags();
});

document.getElementById("lista-bags").addEventListener("input", (evento) => {
  const alvo = evento.target;
  if (!alvo.classList.contains("input-peso-bag")) return;
  pesosBags[Number(alvo.dataset.indice)] = Number(alvo.value) || 0;
  atualizarResumoLote();
});

document.getElementById("lista-bags").addEventListener("click", (evento) => {
  const botao = evento.target.closest(".btn-remover-bag");
  if (!botao) return;
  pesosBags.splice(Number(botao.dataset.indice), 1);
  renderListaBags();
});

/* ---------- Registros (tabela) ---------- */

async function buscarRegistros() {
  const { data, error } = await supabaseCliente
    .from("armazem_lotes")
    .select("id, lote, nome, referencia, data, peso_balanca, armazem_bags(peso)")
    .order("data", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);

  if (error) throw error;
  return data;
}

function renderTabelaRegistros(registros) {
  const corpo = document.getElementById("tabela-registros");

  if (!registros || registros.length === 0) {
    corpo.innerHTML = `<tr><td colspan="10" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = registros
    .map((r) => {
      const qtdBags = r.armazem_bags.length;
      const somaBags = r.armazem_bags.reduce((soma, b) => soma + Number(b.peso), 0);
      const pesoBag = qtdBags * PESO_BAG_UNITARIO;
      const pesoArmazem = somaBags - pesoBag;
      const qtdSacos = pesoArmazem / KG_POR_SACO;

      return `
        <tr>
          <td>${r.lote}</td>
          <td>${r.nome}</td>
          <td>${r.referencia}</td>
          <td>${formatarData(r.data)}</td>
          <td>${r.peso_balanca != null ? formatarNumero(r.peso_balanca, 3) : "—"}</td>
          <td>${formatarNumero(pesoArmazem, 3)}</td>
          <td>${qtdBags}</td>
          <td>${formatarNumero(pesoBag, 2)}</td>
          <td>${formatarNumero(qtdSacos, 2)}</td>
          <td><button type="button" class="btn-excluir-registro" data-id="${r.id}" aria-label="Excluir registro">×</button></td>
        </tr>`;
    })
    .join("");
}

async function atualizarTabela() {
  try {
    renderTabelaRegistros(await buscarRegistros());
  } catch (erro) {
    console.error("Erro ao carregar registros:", erro.message);
  }
}

document.getElementById("tabela-registros").addEventListener("click", async (evento) => {
  const botao = evento.target.closest(".btn-excluir-registro");
  if (!botao) return;
  if (!confirm("Excluir este registro e os pesos dos bags associados?")) return;

  const { error } = await supabaseCliente.from("armazem_lotes").delete().eq("id", botao.dataset.id);
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }
  await atualizarTabela();
});

/* ---------- Formulário de novo registro ---------- */

document.getElementById("form-lote").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const erroEl = document.getElementById("form-erro");
  erroEl.textContent = "";

  const lote = Number(document.getElementById("campo-lote").value);
  const nome = document.getElementById("campo-nome").value.trim();
  const referencia = document.getElementById("campo-referencia").value;
  const data = document.getElementById("campo-data").value;
  const pesoBalancaValor = document.getElementById("campo-peso-balanca").value;
  const pesoBalanca = pesoBalancaValor === "" ? null : Number(pesoBalancaValor);

  try {
    const { data: novoLote, error: erroLote } = await supabaseCliente
      .from("armazem_lotes")
      .insert({ lote, nome, referencia, data, peso_balanca: pesoBalanca })
      .select()
      .single();
    if (erroLote) throw erroLote;

    const bagsValidos = pesosBags.filter((p) => Number(p) > 0);
    if (bagsValidos.length > 0) {
      const { error: erroBags } = await supabaseCliente
        .from("armazem_bags")
        .insert(bagsValidos.map((peso) => ({ lote_id: novoLote.id, peso: Number(peso) })));
      if (erroBags) throw erroBags;
    }

    document.getElementById("form-lote").reset();
    pesosBags = [];
    renderListaBags();
    await atualizarTabela();
  } catch (erro) {
    erroEl.textContent = "Erro ao salvar: " + erro.message;
  }
});

/* ---------- Login / sessão ---------- */

function mostrarAreaLogada(logado) {
  document.getElementById("btn-abrir-login").hidden = logado;
  if (logado) document.getElementById("login-card").hidden = true;
  document.getElementById("app-armazem").hidden = !logado;
  document.getElementById("aviso-login").hidden = logado;
}

document.getElementById("btn-abrir-login").addEventListener("click", () => {
  const card = document.getElementById("login-card");
  card.hidden = !card.hidden;
});

supabaseCliente.auth.getSession().then(({ data: { session } }) => {
  mostrarAreaLogada(!!session);
  if (session) atualizarTabela();
});

supabaseCliente.auth.onAuthStateChange((_evento, session) => {
  mostrarAreaLogada(!!session);
  if (session) atualizarTabela();
});

document.getElementById("login-form").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  erroEl.textContent = "";

  const { error } = await supabaseCliente.auth.signInWithPassword({ email, password: senha });
  if (error) {
    erroEl.textContent = "Login inválido: " + error.message;
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await supabaseCliente.auth.signOut();
});

renderListaBags();
