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

function pesoLiquidoDeBags(pesos) {
  const qtd = pesos.length;
  const soma = pesos.reduce((acc, p) => acc + (Number(p) || 0), 0);
  const tara = qtd * PESO_BAG_UNITARIO;
  return { qtd, soma, tara, liquido: soma - tara };
}

/* ---------- Lista de peso dos bags (reutilizada nos dois formulários) ---------- */

function criarListaBags(idLista, idBotaoAdd, aoAtualizar) {
  let pesos = [];

  function render() {
    const lista = document.getElementById(idLista);
    lista.innerHTML = pesos
      .map(
        (peso, i) => `
        <div class="linha-bag">
          <span class="linha-bag-numero">Bag ${i + 1}</span>
          <input type="number" step="0.001" min="0" value="${peso}" data-indice="${i}" class="input-peso-bag" />
          <button type="button" class="btn-remover-bag" data-indice="${i}" aria-label="Remover bag">×</button>
        </div>`
      )
      .join("");
    aoAtualizar(pesos);
  }

  document.getElementById(idBotaoAdd).addEventListener("click", () => {
    pesos.push(0);
    render();
  });

  document.getElementById(idLista).addEventListener("input", (evento) => {
    const alvo = evento.target;
    if (!alvo.classList.contains("input-peso-bag")) return;
    pesos[Number(alvo.dataset.indice)] = Number(alvo.value) || 0;
    aoAtualizar(pesos);
  });

  document.getElementById(idLista).addEventListener("click", (evento) => {
    const botao = evento.target.closest(".btn-remover-bag");
    if (!botao) return;
    pesos.splice(Number(botao.dataset.indice), 1);
    render();
  });

  return {
    obterPesos: () => pesos,
    limpar: () => {
      pesos = [];
      render();
    },
  };
}

/* ---------- Aba Armazém ---------- */

function atualizarResumoLote(pesos) {
  const { qtd, tara, liquido } = pesoLiquidoDeBags(pesos);
  document.getElementById("resumo-qtd-bags").textContent = qtd;
  document.getElementById("resumo-peso-armazem").textContent = formatarNumero(liquido, 3);
  document.getElementById("resumo-peso-bag").textContent = formatarNumero(tara, 2);
  document.getElementById("resumo-qtd-sacos").textContent = formatarNumero(liquido / KG_POR_SACO, 2);
}

const listaBagsArmazem = criarListaBags("lista-bags", "btn-add-bag", atualizarResumoLote);

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
      const { qtd, tara, liquido } = pesoLiquidoDeBags(r.armazem_bags.map((b) => b.peso));

      return `
        <tr>
          <td>${r.lote}</td>
          <td>${r.nome}</td>
          <td>${r.referencia}</td>
          <td>${formatarData(r.data)}</td>
          <td>${r.peso_balanca != null ? formatarNumero(r.peso_balanca, 3) : "—"}</td>
          <td>${formatarNumero(liquido, 3)}</td>
          <td>${qtd}</td>
          <td>${formatarNumero(tara, 2)}</td>
          <td>${formatarNumero(liquido / KG_POR_SACO, 2)}</td>
          <td><button type="button" class="btn-excluir-registro" data-id="${r.id}" aria-label="Excluir registro">×</button></td>
        </tr>`;
    })
    .join("");
}

function renderTabelaTotaisPorNome(registros) {
  const corpo = document.getElementById("tabela-totais-nome");
  const totais = {};

  (registros || [])
    .filter((r) => r.referencia === "Entrada")
    .forEach((r) => {
      const { liquido } = pesoLiquidoDeBags(r.armazem_bags.map((b) => b.peso));
      const qtdSacos = liquido / KG_POR_SACO;
      totais[r.nome] = (totais[r.nome] || 0) + qtdSacos;
    });

  const nomes = Object.keys(totais).sort();
  if (nomes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="2" class="vazio">Nenhuma entrada ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = nomes
    .map((nome) => `<tr><td>${nome}</td><td>${formatarNumero(totais[nome], 2)}</td></tr>`)
    .join("");
}

async function atualizarTabela() {
  try {
    const registros = await buscarRegistros();
    renderTabelaRegistros(registros);
    renderTabelaTotaisPorNome(registros);
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

    const bagsValidos = listaBagsArmazem.obterPesos().filter((p) => Number(p) > 0);
    if (bagsValidos.length > 0) {
      const { error: erroBags } = await supabaseCliente
        .from("armazem_bags")
        .insert(bagsValidos.map((peso) => ({ lote_id: novoLote.id, peso: Number(peso) })));
      if (erroBags) throw erroBags;
    }

    document.getElementById("form-lote").reset();
    listaBagsArmazem.limpar();
    await atualizarTabela();
  } catch (erro) {
    erroEl.textContent = "Erro ao salvar: " + erro.message;
  }
});

/* ---------- Aba Estoque ---------- */

function atualizarResumoEstoque(pesos) {
  const { qtd, liquido } = pesoLiquidoDeBags(pesos);
  const ap = Number(document.getElementById("campo-ap").value) || 0;
  const custo = Number(document.getElementById("campo-custo").value) || 0;
  const pesoAp = liquido * (ap / 100);
  const custoTotal = custo * pesoAp;

  document.getElementById("resumo-estoque-qtd").textContent = qtd;
  document.getElementById("resumo-estoque-peso").textContent = formatarNumero(liquido, 3);
  document.getElementById("resumo-estoque-qtd-sacas").textContent = formatarNumero(liquido / KG_POR_SACO, 2);
  document.getElementById("resumo-estoque-peso-ap").textContent = formatarNumero(pesoAp, 3);
  document.getElementById("resumo-estoque-custo-total").textContent = formatarNumero(custoTotal, 2);
}

const listaBagsEstoque = criarListaBags("lista-bags-estoque", "btn-add-bag-estoque", atualizarResumoEstoque);

document.getElementById("campo-ap").addEventListener("input", () => atualizarResumoEstoque(listaBagsEstoque.obterPesos()));
document.getElementById("campo-custo").addEventListener("input", () => atualizarResumoEstoque(listaBagsEstoque.obterPesos()));

async function buscarEstoque() {
  const { data, error } = await supabaseCliente
    .from("estoque_itens")
    .select("id, ap_percentual, custo, observacao, estoque_bags(peso)")
    .order("id", { ascending: false })
    .limit(300);

  if (error) throw error;
  return data;
}

function renderTabelaEstoque(itens) {
  const corpo = document.getElementById("tabela-estoque");

  if (!itens || itens.length === 0) {
    corpo.innerHTML = `<tr><td colspan="9" class="vazio">Nenhum item ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = itens
    .map((item) => {
      const { qtd, liquido } = pesoLiquidoDeBags(item.estoque_bags.map((b) => b.peso));
      const pesoAp = liquido * (item.ap_percentual / 100);
      const custoTotal = item.custo * pesoAp;

      return `
        <tr>
          <td>${qtd}</td>
          <td>${formatarNumero(item.ap_percentual, 2)}</td>
          <td>${formatarNumero(liquido, 3)}</td>
          <td>${formatarNumero(liquido / KG_POR_SACO, 2)}</td>
          <td>${formatarNumero(item.custo, 2)}</td>
          <td>${formatarNumero(pesoAp, 3)}</td>
          <td>${formatarNumero(custoTotal, 2)}</td>
          <td>${item.observacao ? item.observacao : "—"}</td>
          <td><button type="button" class="btn-excluir-estoque" data-id="${item.id}" aria-label="Excluir item">×</button></td>
        </tr>`;
    })
    .join("");
}

async function atualizarEstoque() {
  try {
    renderTabelaEstoque(await buscarEstoque());
  } catch (erro) {
    console.error("Erro ao carregar estoque:", erro.message);
  }
}

document.getElementById("tabela-estoque").addEventListener("click", async (evento) => {
  const botao = evento.target.closest(".btn-excluir-estoque");
  if (!botao) return;
  if (!confirm("Excluir este item de estoque e os pesos dos bags associados?")) return;

  const { error } = await supabaseCliente.from("estoque_itens").delete().eq("id", botao.dataset.id);
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }
  await atualizarEstoque();
});

document.getElementById("form-estoque").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const erroEl = document.getElementById("form-erro-estoque");
  erroEl.textContent = "";

  const apPercentual = Number(document.getElementById("campo-ap").value);
  const custo = Number(document.getElementById("campo-custo").value);
  const observacaoValor = document.getElementById("campo-observacao").value.trim();
  const observacao = observacaoValor === "" ? null : observacaoValor;

  try {
    const { data: novoItem, error: erroItem } = await supabaseCliente
      .from("estoque_itens")
      .insert({ ap_percentual: apPercentual, custo, observacao })
      .select()
      .single();
    if (erroItem) throw erroItem;

    const bagsValidos = listaBagsEstoque.obterPesos().filter((p) => Number(p) > 0);
    if (bagsValidos.length > 0) {
      const { error: erroBags } = await supabaseCliente
        .from("estoque_bags")
        .insert(bagsValidos.map((peso) => ({ item_id: novoItem.id, peso: Number(peso) })));
      if (erroBags) throw erroBags;
    }

    document.getElementById("form-estoque").reset();
    listaBagsEstoque.limpar();
    atualizarResumoEstoque([]);
    await atualizarEstoque();
  } catch (erro) {
    erroEl.textContent = "Erro ao salvar: " + erro.message;
  }
});

/* ---------- Abas (Armazém / Estoque) ---------- */

document.getElementById("tab-nav").addEventListener("click", (evento) => {
  const botao = evento.target.closest(".tab-botao");
  if (!botao) return;

  const aba = botao.dataset.tab;
  document.querySelectorAll(".tab-botao").forEach((b) => b.classList.toggle("ativo", b === botao));
  document.getElementById("tab-armazem").hidden = aba !== "armazem";
  document.getElementById("tab-estoque").hidden = aba !== "estoque";
});

/* ---------- Login / sessão ---------- */

function mostrarAreaLogada(logado) {
  document.getElementById("btn-abrir-login").hidden = logado;
  if (logado) document.getElementById("login-card").hidden = true;
  document.getElementById("app-conteudo").hidden = !logado;
  document.getElementById("aviso-login").hidden = logado;
}

document.getElementById("btn-abrir-login").addEventListener("click", () => {
  const card = document.getElementById("login-card");
  card.hidden = !card.hidden;
});

supabaseCliente.auth.getSession().then(({ data: { session } }) => {
  mostrarAreaLogada(!!session);
  if (session) {
    atualizarTabela();
    atualizarEstoque();
  }
});

supabaseCliente.auth.onAuthStateChange((_evento, session) => {
  mostrarAreaLogada(!!session);
  if (session) {
    atualizarTabela();
    atualizarEstoque();
  }
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
