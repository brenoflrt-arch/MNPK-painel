const supabaseCliente = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const RESULTADO_LUCRO = "LUCRO";
const RESULTADO_PREJUIZO = "PREJUÍZO";

let filtroPeriodoAtual = "tudo";

function dataInicioFiltro() {
  const agora = new Date();
  if (filtroPeriodoAtual === "dia") {
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);
    return inicio;
  }
  if (filtroPeriodoAtual === "semana") {
    return new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (filtroPeriodoAtual === "mes") {
    return new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null; // "tudo"
}

function formatarHorario(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatarDuracao(segundosTotais) {
  if (!isFinite(segundosTotais) || segundosTotais < 0) return "—";
  const min = Math.floor(segundosTotais / 60);
  const seg = Math.round(segundosTotais % 60);
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

function formatarPontos(valor) {
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${valor.toFixed(2)} pts`;
}

function formatarPreco(valor) {
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CONTRATOS_POR_OPERACAO = 5;
const VALOR_POR_PONTO_USD = 2;
const USD_POR_PONTO = CONTRATOS_POR_OPERACAO * VALOR_POR_PONTO_USD;

function formatarUSDValor(valor) {
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";
  return `${sinal}US$ ${Math.abs(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarUSDContabil(valor) {
  const abs = Math.abs(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return valor < 0 ? `US$ (${abs})` : `US$ ${abs}`;
}

function formatarUSD(pontos) {
  return formatarUSDValor(pontos * USD_POR_PONTO);
}

const LIMITE_TIMES_SALES = 200;

async function buscarTimesSales() {
  const { data, error } = await supabaseCliente
    .from("negociacoes_tempo_real")
    .select("horario, preco, quantidade, direcao")
    .order("criado_em", { ascending: false })
    .limit(LIMITE_TIMES_SALES);

  if (error) throw error;
  return data;
}

function renderTimesSales(negociacoes) {
  const corpo = document.getElementById("tabela-times-sales");

  if (!negociacoes || negociacoes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="3" class="vazio">Nenhuma negociação ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = negociacoes
    .map((n) => {
      const classe = n.direcao === "compra" ? "ts-compra" : "ts-venda";
      return `
        <tr class="${classe}">
          <td>${(n.horario || "").slice(0, 8)}</td>
          <td>${formatarPreco(n.preco)}</td>
          <td>${n.quantidade}</td>
        </tr>`;
    })
    .join("");
}

async function buscarCotacaoAtual() {
  const { data, error } = await supabaseCliente.from("cotacao_atual").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

function renderCotacao(cotacao) {
  const el = document.getElementById("cotacao-atual");
  if (!cotacao) {
    el.textContent = "";
    return;
  }
  el.innerHTML = `<span class="ticker">${cotacao.ticker}</span>${formatarPreco(cotacao.preco)}`;
}

async function buscarTentativasUnificadas() {
  let consulta = supabaseCliente
    .from("tentativas_2")
    .select(
      "id, criado_em, regiao_preco, direcao, operacao_provavel, notificado, negociacoes_primeira_tentativa, operacoes_reais(id, criado_em, regiao_3_trava, operacao, preco_executado_ninja, preco_saida, resultado, pontos_resultado, mep_pontos)"
    )
    .order("criado_em", { ascending: false })
    .limit(300);

  const inicio = dataInicioFiltro();
  if (inicio) consulta = consulta.gte("criado_em", inicio.toISOString());

  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

function calcularEstatisticas(
  operacoes,
  pontosGanhoDe = (o) => Math.abs(o.alvo - o.regiao_preco),
  pontosPerdaDe = (o) => Math.abs(o.stop - o.regiao_preco)
) {
  const resolvidas = operacoes.filter((o) => o.resultado);
  const pendentes = operacoes.length - resolvidas.length;
  const lucro = resolvidas.filter((o) => o.resultado === RESULTADO_LUCRO);
  const prejuizo = resolvidas.filter((o) => o.resultado === RESULTADO_PREJUIZO);

  const pontosGanhos = lucro.reduce((soma, o) => soma + pontosGanhoDe(o), 0);
  const pontosPerdidos = prejuizo.reduce((soma, o) => soma + pontosPerdaDe(o), 0);

  const duracaoSegundos = (o) => (new Date(o.resolvido_em) - new Date(o.criado_em)) / 1000;
  const mediaDuracao = (lista) =>
    lista.length ? lista.reduce((soma, o) => soma + duracaoSegundos(o), 0) / lista.length : NaN;

  const taxaAcerto = resolvidas.length ? (lucro.length / resolvidas.length) * 100 : 0;

  return {
    total: operacoes.length,
    resolvidas: resolvidas.length,
    pendentes,
    lucro,
    prejuizo,
    taxaAcerto,
    pontosGanhos,
    pontosPerdidos,
    pontosTotais: pontosGanhos - pontosPerdidos,
    duracaoMediaGeral: mediaDuracao(resolvidas),
    duracaoMediaLucro: mediaDuracao(lucro),
    duracaoMediaPrejuizo: mediaDuracao(prejuizo),
  };
}

function renderCards(stats, gridId = "cards-grid") {
  const grid = document.getElementById(gridId);

  const linha = (rotulo, valor, classe = "") =>
    `<div class="linha"><span class="rotulo">${rotulo}</span><span class="valor ${classe}">${valor}</span></div>`;

  grid.innerHTML = `
    <div class="card">
      <h3>Todas as operações</h3>
      ${linha("Total de operações", stats.total)}
      ${linha("Taxa de acerto", stats.taxaAcerto.toFixed(1) + "%")}
      ${linha("Pontuação total", formatarPontos(stats.pontosTotais), stats.pontosTotais >= 0 ? "good" : "critical")}
      ${linha("Resultado total", formatarUSD(stats.pontosTotais), stats.pontosTotais >= 0 ? "good" : "critical")}
      ${linha("Tempo médio de operação", formatarDuracao(stats.duracaoMediaGeral))}
    </div>
    <div class="card">
      <h3>Operações com lucro</h3>
      ${linha("Total de operações", stats.lucro.length)}
      ${linha("Pontos ganhos", "+" + stats.pontosGanhos.toFixed(2) + " pts", "good")}
      ${linha("Ganhos", formatarUSD(stats.pontosGanhos), "good")}
      ${linha("Tempo médio até o alvo", formatarDuracao(stats.duracaoMediaLucro))}
    </div>
    <div class="card">
      <h3>Operações com prejuízo</h3>
      ${linha("Total de operações", stats.prejuizo.length)}
      ${linha("Pontos perdidos", "-" + stats.pontosPerdidos.toFixed(2) + " pts", "critical")}
      ${linha("Perdas", formatarUSD(-stats.pontosPerdidos), "critical")}
      ${linha("Tempo médio até o stop", formatarDuracao(stats.duracaoMediaPrejuizo))}
    </div>
  `;
}

function renderPizza(stats, pizzaId = "pizza", legendaId = "pizza-legenda") {
  const pizza = document.getElementById(pizzaId);
  const legenda = document.getElementById(legendaId);
  const totalResolvidas = stats.lucro.length + stats.prejuizo.length;

  if (totalResolvidas === 0) {
    pizza.style.background = "var(--surface-2)";
    legenda.innerHTML = `<li><span class="rotulo" style="color:var(--text-muted)">Nenhuma operação resolvida ainda</span></li>`;
    return;
  }

  const pctLucro = (stats.lucro.length / totalResolvidas) * 100;
  const pctPrejuizo = 100 - pctLucro;

  pizza.style.background = `conic-gradient(var(--good) 0% ${pctLucro}%, var(--critical) ${pctLucro}% 100%)`;

  legenda.innerHTML = `
    <li><span class="ponto" style="background:var(--good)"></span>Lucro: <strong>${stats.lucro.length}</strong> (${pctLucro.toFixed(1)}%)</li>
    <li><span class="ponto" style="background:var(--critical)"></span>Prejuízo: <strong>${stats.prejuizo.length}</strong> (${pctPrejuizo.toFixed(1)}%)</li>
  `;
}

function renderBarras(
  operacoes,
  containerId = "barras",
  deltaUSD = (o) =>
    (o.resultado === RESULTADO_LUCRO ? Math.abs(o.alvo - o.regiao_preco) : -Math.abs(o.stop - o.regiao_preco)) *
    USD_POR_PONTO
) {
  const container = document.getElementById(containerId);
  const resolvidas = operacoes.filter((o) => o.resultado).slice().reverse(); // cronologico

  if (resolvidas.length === 0) {
    container.innerHTML = `<p style="margin:auto;color:var(--text-muted);font-size:0.85rem;">Nenhuma operação resolvida ainda</p>`;
    return;
  }

  let acumulado = 0;
  const cumulativos = resolvidas.map((o) => (acumulado += deltaUSD(o)));

  const minVal = Math.min(0, ...cumulativos);
  const maxVal = Math.max(0, ...cumulativos);
  const range = maxVal - minVal || 1;
  const alturaContainer = 170;
  const zeroBottomPx = ((0 - minVal) / range) * alturaContainer;

  let html = `<div class="linha-zero" style="bottom:${zeroBottomPx}px;"></div>`;
  cumulativos.forEach((valor, i) => {
    const alturaPx = Math.max((Math.abs(valor) / range) * alturaContainer, 2);
    const classe = valor >= 0 ? "good" : "critical";
    const posicao =
      valor >= 0
        ? `bottom:${zeroBottomPx}px; height:${alturaPx}px;`
        : `bottom:${zeroBottomPx - alturaPx}px; height:${alturaPx}px;`;
    const titulo = `${formatarHorario(resolvidas[i].criado_em)} — Acumulado: ${formatarUSDValor(valor)}`;
    html += `<div class="barra ${classe}" style="position:absolute; ${posicao}" title="${titulo}"></div>`;
  });

  const idxMinimo = cumulativos.indexOf(Math.min(...cumulativos));
  const idxFinal = cumulativos.length - 1;
  const valorMinimo = cumulativos[idxMinimo];
  const valorFinal = cumulativos[idxFinal];

  if (valorMinimo < 0) {
    html += `<div class="rotulo-acumulado critical" style="left:${idxMinimo * 12 + 4}px; bottom:2px;">${formatarUSDContabil(valorMinimo)}</div>`;
  }
  html += `<div class="rotulo-acumulado ${valorFinal >= 0 ? "good" : "critical"}" style="left:${idxFinal * 12 + 4}px; bottom:${zeroBottomPx + Math.max((Math.abs(valorFinal) / range) * alturaContainer, 2) + 4}px;">${formatarUSDContabil(valorFinal)}</div>`;

  container.style.position = "relative";
  container.innerHTML = html;

  // Reposiciona as barras lado a lado (o container usa position:relative + barras absolutas empilhadas por index)
  const barras = container.querySelectorAll(".barra");
  barras.forEach((b, i) => {
    b.style.left = `${i * 12 + 4}px`;
  });
  container.style.minWidth = `${resolvidas.length * 12 + 60}px`;
}

function horaSomente(dataIso) {
  if (!dataIso) return "—";
  return new Date(dataIso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function calcularPrimeiraTrava(negociacoes) {
  if (!negociacoes || negociacoes.length === 0) return null;
  const ultimo = negociacoes[negociacoes.length - 1];
  const base = negociacoes.length > 1 ? negociacoes.slice(0, -1) : negociacoes;
  const precoMedio = base.reduce((soma, n) => soma + n.preco, 0) / base.length;
  return { horario: (ultimo.horario || "").slice(0, 8), preco: precoMedio };
}

function renderTabelaUnificada(tentativas) {
  const corpoCompletas = document.getElementById("tabela-unificada");
  const corpoPendentes = document.getElementById("tabela-pendentes");

  if (!tentativas || tentativas.length === 0) {
    corpoCompletas.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum registro ainda</td></tr>`;
    corpoPendentes.innerHTML = `<tr><td colspan="2" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  const completas = [];
  const pendentes = [];

  tentativas.forEach((t) => {
    const primeira = calcularPrimeiraTrava(t.negociacoes_primeira_tentativa);
    const op = t.operacoes_reais && t.operacoes_reais[0];
    const corProvavel = t.operacao_provavel === "compra" ? "good" : "critical";

    const celPrimeira = primeira
      ? `${primeira.horario}<span class="sub">${formatarPreco(primeira.preco)}</span>`
      : "(-)";
    const celSegunda = `${horaSomente(t.criado_em)}<span class="sub">${formatarPreco(t.regiao_preco)}</span>`;

    if (!op) {
      pendentes.push(`
        <tr>
          <td class="trava-${corProvavel}">${celPrimeira}</td>
          <td class="trava-${corProvavel}">${celSegunda}</td>
        </tr>`);
      return;
    }

    const corOperacao = op.operacao === "compra" ? "good" : "critical";
    const simbolo = op.operacao === "compra" ? "C" : "V";
    const preco = op.preco_executado_ninja ?? op.regiao_3_trava;
    const celTerceira = `${horaSomente(op.criado_em)}<span class="sub">${simbolo} ${formatarPreco(preco)}</span>`;

    let celResultado = `<span class="tag pendente">Em andamento</span>`;
    if (op.resultado === RESULTADO_LUCRO) celResultado = `<span class="tag lucro">Lucro</span>`;
    else if (op.resultado === RESULTADO_PREJUIZO) celResultado = `<span class="tag prejuizo">Prejuízo</span>`;

    const celPontos = op.pontos_resultado != null
      ? `<span class="trava-${op.pontos_resultado >= 0 ? "good" : "critical"}">${op.pontos_resultado > 0 ? "+" : ""}${op.pontos_resultado} pts</span>`
      : "(-)";
    const celMep = op.mep_pontos != null ? `${Number(op.mep_pontos).toFixed(2)} pts` : "(-)";

    completas.push(`
      <tr>
        <td class="trava-${corProvavel}">${celPrimeira}</td>
        <td class="trava-${corProvavel}">${celSegunda}</td>
        <td class="trava-${corOperacao}">${celTerceira}</td>
        <td>${celResultado}</td>
        <td>${celPontos}</td>
        <td>${celMep}</td>
      </tr>`);
  });

  corpoCompletas.innerHTML = completas.length
    ? completas.join("")
    : `<tr><td colspan="6" class="vazio">Nenhum registro ainda</td></tr>`;
  corpoPendentes.innerHTML = pendentes.length
    ? pendentes.join("")
    : `<tr><td colspan="2" class="vazio">Nenhum registro ainda</td></tr>`;
}

async function atualizarPublico() {
  try {
    try {
      renderCotacao(await buscarCotacaoAtual());
    } catch (erroCotacao) {
      console.error("Erro ao carregar cotação:", erroCotacao.message);
    }

    try {
      renderTimesSales(await buscarTimesSales());
    } catch (erroTimesSales) {
      console.error("Erro ao carregar Times & Sales:", erroTimesSales.message);
    }

    document.getElementById("ultima-atualizacao").textContent =
      "Última atualização: " + new Date().toLocaleTimeString("pt-BR");
  } catch (erro) {
    document.getElementById("ultima-atualizacao").textContent =
      "Erro ao carregar dados: " + erro.message;
  }
}

async function atualizarPrivado() {
  try {
    const tentativas = await buscarTentativasUnificadas();
    renderTabelaUnificada(tentativas);

    const operacoes = tentativas.map((t) => t.operacoes_reais && t.operacoes_reais[0]).filter(Boolean);
    const pontosDe = (o) => Math.abs((o.preco_saida ?? o.preco_executado_ninja) - o.preco_executado_ninja);
    const stats = calcularEstatisticas(operacoes, pontosDe, pontosDe);

    renderCards(stats);
    renderPizza(stats);
    renderBarras(
      operacoes,
      "barras",
      (o) => (o.resultado === RESULTADO_LUCRO ? pontosDe(o) : -pontosDe(o)) * USD_POR_PONTO
    );
  } catch (erro) {
    console.error("Erro ao carregar dados privados:", erro.message);
  }
}

async function atualizarTudo() {
  const { data: { session } } = await supabaseCliente.auth.getSession();
  await atualizarPublico();
  if (session) await atualizarPrivado();
}

function mostrarAreaLogada(logado) {
  document.getElementById("btn-abrir-login").hidden = logado;
  if (logado) document.getElementById("login-card").hidden = true;
  document.getElementById("tabelas-grid").hidden = !logado;
  document.getElementById("charts-grid").hidden = !logado;
  document.getElementById("cards-grid").hidden = !logado;
}

document.getElementById("btn-abrir-login").addEventListener("click", () => {
  const card = document.getElementById("login-card");
  card.hidden = !card.hidden;
});

supabaseCliente.auth.getSession().then(({ data: { session } }) => {
  mostrarAreaLogada(!!session);
});

supabaseCliente.auth.onAuthStateChange((_evento, session) => {
  mostrarAreaLogada(!!session);
  if (session) atualizarPrivado();
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

document.getElementById("filtro-periodo").addEventListener("click", (evento) => {
  const botao = evento.target.closest("button[data-periodo]");
  if (!botao) return;

  filtroPeriodoAtual = botao.dataset.periodo;
  document
    .querySelectorAll("#filtro-periodo button")
    .forEach((b) => b.classList.toggle("ativo", b === botao));

  atualizarTudo();
});

atualizarTudo();
setInterval(atualizarTudo, 30000);
