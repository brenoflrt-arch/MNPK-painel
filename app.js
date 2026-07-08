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

async function buscarDadosPublicos() {
  const { data, error } = await supabaseCliente
    .from("operacoes_publicas")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(300);

  if (error) throw error;
  return data;
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

async function buscarDadosPrivados() {
  const [respTentativas, respOperacoes, respUnificado] = await Promise.all([
    supabaseCliente.from("tentativas_2").select("*").order("criado_em", { ascending: false }).limit(300),
    supabaseCliente.from("operacoes_ficticias").select("*").order("criado_em", { ascending: false }).limit(300),
    supabaseCliente
      .from("tentativas_2")
      .select(
        "id, criado_em, regiao_preco, direcao, operacao_provavel, notificado, negociacoes_primeira_tentativa, operacoes_ficticias(id, criado_em, regiao_preco, operacao, alvo, stop, resultado)"
      )
      .order("criado_em", { ascending: false })
      .limit(300),
  ]);

  if (respTentativas.error) throw respTentativas.error;
  if (respOperacoes.error) throw respOperacoes.error;
  if (respUnificado.error) throw respUnificado.error;

  return {
    tentativas: respTentativas.data,
    operacoes: respOperacoes.data,
    unificado: respUnificado.data,
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

  const deltaUSD = (o) =>
    (o.resultado === RESULTADO_LUCRO ? Math.abs(o.alvo - o.regiao_preco) : -Math.abs(o.stop - o.regiao_preco)) *
    USD_POR_PONTO;

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
          <td>${formatarPreco(t.regiao_preco)}</td>
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
          <span>${formatarPreco(n.preco)}</span>
          <span>${n.quantidade}</span>
        </div>`
    )
    .join("");
}

function abrirModalTentativa(tentativa) {
  document.getElementById("modal-titulo").textContent =
    `Trava — região ${formatarPreco(tentativa.regiao_preco)} (${formatarHorario(tentativa.criado_em)})`;
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
          <td>${formatarPreco(o.regiao_preco)}</td>
          <td><span class="tag ${o.operacao === "compra" ? "compra" : "venda"}">${o.operacao === "compra" ? "Compra" : "Venda"}</span></td>
          <td>${formatarPreco(o.alvo)}</td>
          <td>${formatarPreco(o.stop)}</td>
          <td>${resultadoTag}</td>
        </tr>`;
    })
    .join("");
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
  const corpo = document.getElementById("tabela-unificada");

  if (!tentativas || tentativas.length === 0) {
    corpo.innerHTML = `<tr><td colspan="8" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = tentativas
    .map((t) => {
      const primeira = calcularPrimeiraTrava(t.negociacoes_primeira_tentativa);
      const op = t.operacoes_ficticias && t.operacoes_ficticias[0];
      const corProvavel = t.operacao_provavel === "compra" ? "good" : "critical";

      const celPrimeira = primeira
        ? `${primeira.horario}<span class="sub">${formatarPreco(primeira.preco)}</span>`
        : "(-)";
      const celSegunda = `${horaSomente(t.criado_em)}<span class="sub">${formatarPreco(t.regiao_preco)}</span>`;
      const celTerceira = op
        ? `${horaSomente(op.criado_em)}<span class="sub">${formatarPreco(op.regiao_preco)}</span>`
        : "(-)";

      let celOperacao = "(-)";
      if (op) {
        const simbolo = op.operacao === "compra" ? "C" : "V";
        celOperacao = `<span class="tag ${op.operacao === "compra" ? "compra" : "venda"}">${simbolo} ${formatarPreco(op.regiao_preco)}</span>`;
      }

      const celAlvo = op ? formatarPreco(op.alvo) : "(-)";
      const celStop = op ? formatarPreco(op.stop) : "(-)";

      let celResultado = "(-)";
      if (op) {
        if (op.resultado === RESULTADO_LUCRO) celResultado = `<span class="tag lucro">Lucro</span>`;
        else if (op.resultado === RESULTADO_PREJUIZO) celResultado = `<span class="tag prejuizo">Prejuízo</span>`;
        else celResultado = `<span class="tag pendente">Em andamento</span>`;
      }

      const celNotificacao = `<span class="tag ${t.notificado ? "sim" : "nao"}">${t.notificado ? "Sim" : "Não"}</span>`;

      return `
        <tr>
          <td class="trava-${corProvavel}">${celPrimeira}</td>
          <td class="trava-${corProvavel}">${celSegunda}</td>
          <td class="trava-${corProvavel}">${celTerceira}</td>
          <td>${celOperacao}</td>
          <td>${celAlvo}</td>
          <td>${celStop}</td>
          <td>${celResultado}</td>
          <td>${celNotificacao}</td>
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

    try {
      renderCotacao(await buscarCotacaoAtual());
    } catch (erroCotacao) {
      console.error("Erro ao carregar cotação:", erroCotacao.message);
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
    const { tentativas, operacoes, unificado } = await buscarDadosPrivados();
    renderTabelaTentativas(tentativas);
    renderTabelaOperacoes(operacoes);
    renderTabelaUnificada(unificado);
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
