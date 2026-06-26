const pages = {
  cover: {
    pill: "Pasta",
    html: `
      <section class="cover">
        <div>
          <img class="cover-logo" src="imagem_fundo.png" alt="CTG Brasil" />
          <span class="kicker">Diretoria de Engenharia e Gestão de Ativos</span>
          <h1>Engenharia Eletromecânica</h1>
          <p class="lead">Pasta visual de acesso aos temas, documentos e sistemas da área. Clique nas folhas de anotação ao lado da prancheta para abrir cada assunto.</p>
          <a class="cover-stamp" href="/login" aria-label="Acessar CTG.Engenharia">CTG.Engenharia</a>
        </div>
      </section>
    `
  },
  gestao: {
    pill: "01 tema",
    title: "Gestão e rotina",
    lead: "Itens administrativos e de acompanhamento recorrente da Engenharia Eletromecânica.",
    folders: [
      ["Gerência", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FGER%C3%8ANCIA&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Metas CTG", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FMETAS%20CTG&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Férias", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FF%C3%89RIAS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Destaques semanais", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FHIGHLIGHTS%20SEMANAIS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Acompanhamento do time", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FWork%20team%20follow%2Dup&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"]
    ],
    notes: ["Acompanhar rotinas internas da área.", "Centralizar comunicados e metas.", "Apoiar o planejamento de disponibilidade do time."]
  },
  tecnico: {
    pill: "02 tema",
    title: "Documentação técnica",
    lead: "Biblioteca técnica para apoiar elaboração, revisão e rastreabilidade de documentos.",
    folders: [
      ["Dados técnicos dos equipamentos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FDados%20T%C3%A9cnicos%20Equipamentos&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Especificação técnica", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FESPECIFICA%C3%87%C3%83O%20TECNICA&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Numeração de desenhos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FNUMERA%C3%87%C3%83O%20DE%20DESENHOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Numeração de documentos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FNUMERA%C3%87%C3%83O%20DE%20DOCUMENTOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Catálogos, normas e livros", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FCATALOGOS%2DNORMAS%2DLIVROS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Relatórios", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FRELATORIOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Temp_Docs_ISA", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FTemp%5FDocs%5FISA&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"]
    ],
    notes: ["Consultar padrões de especificação.", "Localizar dados técnicos e numerações.", "Reunir relatórios e referências normativas."]
  },
  engenharia: {
    pill: "03 tema",
    title: "Engenharia aplicada",
    lead: "Conteúdo de elétrica, mecânica, confiabilidade, desempenho, riscos e ANEEL.",
    folders: [
      ["Elétrica", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FELETRICA&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Mecânica", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FMECANICA&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Confiabilidade e desempenho", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FCONFIABILIDADE%20E%20PERFORMANCE&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Workshop de riscos O&amp;M", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FO%26M%20RISK%20WORKSHOP&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["ANEEL", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FANEEL&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Diversos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FDIVERSOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"]
    ],
    notes: ["Acessar estudos por disciplina.", "Acompanhar riscos O&M e desempenho.", "Manter materiais regulatórios e diversos."]
  },
  projetos: {
    pill: "04 tema",
    title: "Projetos e suprimentos",
    lead: "Itens ligados a planejamento, projetos, PMS editável, orçamentos e suprimentos.",
    folders: [
      ["Planejamentos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FPLANEJAMENTOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["PMS editável", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FPMS%2DEDITAVEL&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Projetos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FPROJETOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Orçamentos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FOR%C3%87AMENTOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Suprimentos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FSUPRIMENTOS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"]
    ],
    notes: ["Concentrar materiais de planejamento.", "Apoiar o controle de projetos e PMS.", "Facilitar a interface com orçamentos e suprimentos."]
  },
  referencias: {
    pill: "05 tema",
    title: "Referências e acervo",
    lead: "Acervo para apresentações, treinamentos, atas, memorandos e fotos diversas.",
    folders: [
      ["Apresentações e treinamento", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FAPRESENTA%C3%87%C3%95ES%20E%20TREINAMENTO&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Atas, fax e memos", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FATAS%20%2D%20FAX%20%2D%20MEMO&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"],
      ["Fotos diversas", "https://cweibr011.sharepoint.com/sites/HubGestaoAtivosEngenharia/ENGENHARIA_ELETROMECANICA/Forms/AllItems.aspx?id=%2Fsites%2FHubGestaoAtivosEngenharia%2FENGENHARIA%5FELETROMECANICA%2FFOTOS%20DIVERSAS&viewid=a0a061ea%2D9c00%2D4a03%2Dab57%2D8c3b69ea1aff"]
    ],
    notes: ["Guardar memória técnica da área.", "Localizar treinamentos e apresentações.", "Manter registros visuais e atas."]
  },
  sistemas: {
    pill: "06 tema",
    title: "Sistemas",
    lead: "Acesso ao sistema CTG.Engenharia.",
    folders: [
      ["CTG.Engenharia", "/login", "_self"]
    ],
    notes: ["Esta aba deixa a landing pronta para receber mais sistemas no futuro."]
  },
  organograma: {
    pill: "07 tema",
    title: "Organograma da área",
    lead: "Estrutura de referência para consulta rápida da equipe, papéis e interfaces da Engenharia Eletromecânica.",
    folders: [
      ["Gerência", null],
      ["Coordenação técnica", null],
      ["Engenharia elétrica", null],
      ["Engenharia mecânica", null],
      ["Confiabilidade e desempenho", null],
      ["Interfaces de projetos", null]
    ],
    notes: ["Organograma ainda não disponível — em construção dentro da aplicação."]
  }
};

const content = document.querySelector("#paper-content");
const buttons = [...document.querySelectorAll(".note")];

function folderItem([name, href, target = "_blank"]) {
  const icon = `<span class="folder-icon" aria-hidden="true"></span>`;
  if (href) {
    const rel = target === "_blank" ? ` rel="noopener noreferrer"` : "";
    return `
      <a class="folder-item" href="${href}" target="${target}"${rel}>
        ${icon}
        <div><strong>${name}</strong></div>
      </a>
    `;
  }
  return `
    <div class="folder-item is-static">
      ${icon}
      <div><strong>${name}</strong></div>
    </div>
  `;
}

function detailPage(page) {
  return `
    <span class="kicker">${page.pill}</span>
    <h1>${page.title}</h1>
    <p class="lead">${page.lead}</p>
    <div class="folder-grid">${page.folders.map(folderItem).join("")}</div>
  `;
}

function render(pageKey) {
  const page = pages[pageKey] || pages.cover;
  content.classList.remove("is-changing");
  void content.offsetWidth;
  content.innerHTML = page.html || detailPage(page);
  content.classList.add("is-changing");

  buttons.forEach((button) => {
    const isActive = button.dataset.page === pageKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

buttons.forEach((button) => button.addEventListener("click", () => render(button.dataset.page)));
render("cover");
