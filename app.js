const CABECALHOS = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
};

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

async function buscarDados() {
  const [respTentativas, respOperacoes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/tentativas_2?select=*&order=criado_em.desc&limit=300`, { headers: CABECALHOS }),
    fetch(`${SUPABASE_URL}/rest/v1/operacoes_ficticias?select=*&order=criado_em.desc&limit=300`, { headers: CABECALHOS }),
  ]);

  if (!respTentativas.ok || !respOperacoes.ok) {
    throw new Error("Falha ao consultar o Supabase");
  }

  return {
    tentativas: await respTentativas.json(),
    operacoes: await respOperacoes.json(),
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
      ${linha("Tempo médio de operação", formatarDuracao(stats.duracaoMediaGeral))}
    </div>
    <div class="card">
      <h3>Operações com lucro</h3>
      ${linha("Total de operações", stats.lucro.length)}
      ${linha("Pontos ganhos", "+" + stats.pontosGanhos.toFixed(2) + " pts", "good")}
      ${linha("Tempo médio até o alvo", formatarDuracao(stats.duracaoMediaLucro))}
    </div>
    <div class="card">
      <h3>Operações com prejuízo</h3>
      ${linha("Total de operações", stats.prejuizo.length)}
      ${linha("Pontos perdidos", "-" + stats.pontosPerdidos.toFixed(2) + " pts", "critical")}
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

function renderTabelaTentativas(tentativas) {
  const corpo = document.getElementById("tabela-tentativas");

  if (tentativas.length === 0) {
    corpo.innerHTML = `<tr><td colspan="5" class="vazio">Nenhum registro ainda</td></tr>`;
    return;
  }

  corpo.innerHTML = tentativas
    .map((t) => {
      const direcaoTag = t.direcao === "compra" ? "compra" : "venda";
      const notificadoTag = t.notificado ? "sim" : "nao";
      return `
        <tr>
          <td>${formatarHorario(t.criado_em)}</td>
          <td>${Number(t.regiao_preco).toFixed(2)}</td>
          <td><span class="tag ${direcaoTag}">${t.direcao === "compra" ? "Compra" : "Venda"}</span></td>
          <td><span class="tag ${t.operacao_provavel === "compra" ? "compra" : "venda"}">${t.operacao_provavel === "compra" ? "Compra" : "Venda"}</span></td>
          <td><span class="tag ${notificadoTag}">${t.notificado ? "Sim" : "Não"}</span></td>
        </tr>`;
    })
    .join("");
}

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

async function atualizarTudo() {
  try {
    const { tentativas, operacoes } = await buscarDados();
    const stats = calcularEstatisticas(operacoes);

    renderCards(stats);
    renderPizza(stats);
    renderBarras(operacoes);
    renderTabelaTentativas(tentativas);
    renderTabelaOperacoes(operacoes);

    document.getElementById("ultima-atualizacao").textContent =
      "Última atualização: " + new Date().toLocaleTimeString("pt-BR");
  } catch (erro) {
    document.getElementById("ultima-atualizacao").textContent =
      "Erro ao carregar dados: " + erro.message;
  }
}

atualizarTudo();
setInterval(atualizarTudo, 30000);
