const supabaseCliente = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const RESULTADO_LUCRO = "LUCRO";
const RESULTADO_PREJUIZO = "PREJUÍZO";

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

const CONTRATOS_POR_OPERACAO = 5;
const VALOR_POR_PONTO_USD = 2;
const USD_POR_PONTO = CONTRATOS_POR_OPERACAO * VALOR_POR_PONTO_USD;

function formatarUSD(pontos) {
  const valor = pontos * USD_POR_PONTO;
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";
  return `${sinal}$${Math.abs(valor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buscarDadosPublicos() {
  const { data, error } = await supabaseCliente
    .from("operacoes_publicas")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(300);

  if (error) throw error;
  return data;
}

async function buscarDadosPrivados() {
  const [respTentativas, respOperacoes] = await Promise.all([
    supabaseCliente.from("tentativas_2").select("*").order("criado_em", { ascending: false }).limit(300),
    supabaseCliente.from("operacoes_ficticias").select("*").order("criado_em", { ascending: false }).limit(300),
  ]);

  if (respTentativas.error) throw respTentativas.error;
  if (respOperacoes.error) throw respOperacoes.error;

  return {
    tentativas: respTentativas.data,
    operacoes: respOperacoes.data,
  };
}

function calcularEstatisticas(operacoes) {
  const resolvidas = operacoes.filter((o) => o.resultado);
  const pendentes = operacoes.length - resolvidas.length;
  const lucro = resolvidas.filter((o) => o.resultado === RESULTADO_LUCRO);
  const prejuizo = resolvidas.filter((o) => o.resultado === RESULTADO_PREJUIZO);

  const pontosDe = (o) => Math.abs(o.alvo - o.regiao_preco);
  const pontosGanhos = lucro.reduce((soma, o) => soma + pontosDe(o), 0);
  const pontosPerdidos = prejuizo.reduce((soma, o) => soma + Math.abs(o.stop - o.regiao_preco), 0);

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

function renderCards(stats) {
  const grid = document.getElementById("cards-grid");

  const linha = (rotulo, valor, classe = "") =>
    `<div class="linha"><span class="rotulo">${rotulo}</span><span class="valor ${classe}">${valor}</span></div>`;

  grid.innerHTML = `
    <div class="card">
      <h3>Todas as operações</h3>
      ${linha("Total de operações", stats.total)}
      ${linha("Resolvidas", stats.resolvidas)}
      ${linha("Em andamento", stats.pendentes)}
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

function renderPizza(stats) {
  const pizza = document.getElementById("pizza");
  const legenda = document.getElementById("pizza-legenda");
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

function renderBarras(operacoes) {
  const container = document.getElementById("barras");
  const resolvidas = operacoes.filter((o) => o.resultado).slice().reverse(); // cronologico

  if (resolvidas.length === 0) {
    container.innerHTML = `<p style="margin:auto;color:var(--text-muted);font-size:0.85rem;">Nenhuma operação resolvida ainda</p>`;
    return;
  }

  const pontosDe = (o) =>
    o.resultado === RESULTADO_LUCRO ? Math.abs(o.alvo - o.regiao_preco) : -Math.abs(o.stop - o.regiao_preco);

  const valores = resolvidas.map(pontosDe);
  const maxAbs = Math.max(...valores.map(Math.abs), 1);

  let html = `<div class="linha-zero"></div>`;
  resolvidas.forEach((o, i) => {
    const pontos = valores[i];
    const alturaPx = Math.max((Math.abs(pontos) / maxAbs) * 96, 4);
    const classe = pontos >= 0 ? "good" : "critical";
    const posicao = pontos >= 0 ? `bottom:50%; height:${alturaPx}px;` : `top:50%; height:${alturaPx}px;`;
    const titulo = `${formatarHorario(o.criado_em)} — ${o.resultado} (${formatarPontos(pontos)})`;
    html += `<div class="barra ${classe}" style="position:absolute; ${posicao}" title="${titulo}"></div>`;
  });

  container.style.position = "relative";
  container.innerHTML = html;

  // Reposiciona as barras lado a lado (o container usa position:relative + barras absolutas empilhadas por index)
  const barras = container.querySelectorAll(".barra");
  barras.forEach((b, i) => {
    b.style.left = `${i * 12 + 4}px`;
  });
  container.style.minWidth = `${resolvidas.length * 12 + 8}px`;
}

let ultimasTentativas = [];

function renderTabelaTentativas(tentativas) {
  ultimasTentativas = tentativas;
  const corpo = document.getElementById("tabela-tentativas");

  if (tentativas.length === 0) {
    corpo.innerHTML = `<tr><td colspan="5" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = tentativas
    .map((t, i) => {
      const direcaoTag = t.direcao === "compra" ? "compra" : "venda";
      const notificadoTag = t.notificado ? "sim" : "nao";
      return `
        <tr class="linha-clicavel" data-idx="${i}" title="Clique para ver as negociações">
          <td>${formatarHorario(t.criado_em)}</td>
          <td>${Number(t.regiao_preco).toFixed(2)}</td>
          <td><span class="tag ${direcaoTag}">${t.direcao === "compra" ? "Compra" : "Venda"}</span></td>
          <td><span class="tag ${t.operacao_provavel === "compra" ? "compra" : "venda"}">${t.operacao_provavel === "compra" ? "Compra" : "Venda"}</span></td>
          <td><span class="tag ${notificadoTag}">${t.notificado ? "Sim" : "Não"}</span></td>
        </tr>`;
    })
    .join("");
}

function renderListaNegociacoes(container, negociacoes) {
  if (!negociacoes || negociacoes.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;">Sem detalhes registrados</p>`;
    return;
  }

  container.innerHTML = negociacoes
    .map(
      (n) => `
        <div class="ts-linha ${n.direcao === "compra" ? "compra" : "venda"}">
          <span>${n.horario}</span>
          <span>${Number(n.preco).toFixed(2)}</span>
          <span>${n.quantidade}</span>
        </div>`
    )
    .join("");
}

function abrirModalTentativa(tentativa) {
  document.getElementById("modal-titulo").textContent =
    `Trava — região ${Number(tentativa.regiao_preco).toFixed(2)} (${formatarHorario(tentativa.criado_em)})`;
  renderListaNegociacoes(document.getElementById("modal-primeira"), tentativa.negociacoes_primeira_tentativa);
  renderListaNegociacoes(document.getElementById("modal-segunda"), tentativa.negociacoes_segunda_tentativa);
  document.getElementById("modal-backdrop").hidden = false;
}

document.getElementById("tabela-tentativas").addEventListener("click", (evento) => {
  const linha = evento.target.closest("tr[data-idx]");
  if (!linha) return;
  const tentativa = ultimasTentativas[Number(linha.dataset.idx)];
  if (tentativa) abrirModalTentativa(tentativa);
});

document.getElementById("modal-fechar").addEventListener("click", () => {
  document.getElementById("modal-backdrop").hidden = true;
});

document.getElementById("modal-backdrop").addEventListener("click", (evento) => {
  if (evento.target.id === "modal-backdrop") {
    document.getElementById("modal-backdrop").hidden = true;
  }
});

function renderTabelaOperacoes(operacoes) {
  const corpo = document.getElementById("tabela-operacoes");

  if (operacoes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = operacoes
    .map((o) => {
      let resultadoTag = `<span class="tag pendente">Em andamento</span>`;
      if (o.resultado === RESULTADO_LUCRO) resultadoTag = `<span class="tag lucro">Lucro</span>`;
      else if (o.resultado === RESULTADO_PREJUIZO) resultadoTag = `<span class="tag prejuizo">Prejuízo</span>`;

      return `
        <tr>
          <td>${formatarHorario(o.criado_em)}</td>
          <td>${Number(o.regiao_preco).toFixed(2)}</td>
          <td><span class="tag ${o.operacao === "compra" ? "compra" : "venda"}">${o.operacao === "compra" ? "Compra" : "Venda"}</span></td>
          <td>${Number(o.alvo).toFixed(2)}</td>
          <td>${Number(o.stop).toFixed(2)}</td>
          <td>${resultadoTag}</td>
        </tr>`;
    })
    .join("");
}

async function atualizarPublico() {
  try {
    const operacoes = await buscarDadosPublicos();
    const stats = calcularEstatisticas(operacoes);

    renderCards(stats);
    renderPizza(stats);
    renderBarras(operacoes);

    document.getElementById("ultima-atualizacao").textContent =
      "Última atualização: " + new Date().toLocaleTimeString("pt-BR");
  } catch (erro) {
    document.getElementById("ultima-atualizacao").textContent =
      "Erro ao carregar dados: " + erro.message;
  }
}

async function atualizarPrivado() {
  try {
    const { tentativas, operacoes } = await buscarDadosPrivados();
    renderTabelaTentativas(tentativas);
    renderTabelaOperacoes(operacoes);
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
  document.getElementById("login-card").hidden = logado;
  document.getElementById("tabelas-grid").hidden = !logado;
}

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

atualizarTudo();
setInterval(atualizarTudo, 30000);
