# 📋 Painel Operacional Prius

Sistema web leve, modular e *offline-first* desenvolvido para centralizar e automatizar a rotina administrativa, pedagógica e de compras da **Prius**. 

Projetado para operar sem necessidade de servidores complexos ou etapas de compilação (*build*), o painel cruza cronogramas, controla prazos de envio de materiais, agrupa recibos docentes, compara orçamentos e gera relatórios operacionais prontos para a equipe.

---

## ✨ Principais Funcionalidades

* **☀️ Cockpit Diário (Aba Hoje):** Radar inteligente que filtra automaticamente apenas o que exige atenção imediata — envios de slides com alerta de volume (`⚠️ 4+`), confirmações de aula iminentes, chamados de manutenção abertos, cotações pendentes e recibos da semana.
* **📚 Gestão Dinâmica de Cronogramas (Aba Aulas):**
  * **Importação e Substituição (`Diff`):** Extrai aulas diretamente de cronogramas em PDF (`pdf.js`). Ao subir um cronograma revisado, detecta alterações de data ou troca de docentes e desmarca confirmações antigas automaticamente para evitar erros de comunicação.
  * **Quadro Geral e Busca Inteligente:** Grelha editável em tempo real com filtro instantâneo multitermo e suporte a datas no padrão brasileiro (`DD/MM`).
* **🛠️ Bloco Operacional (Aba Semana / Operações):**
  * **Recibos Docentes:** Agrupa múltiplas aulas de um mesmo professor no mesmo dia em uma única entrada (`Recibo > Aprovado > Enviado`), com sistema de unificação de nomes (*Apelidos*).
  * **Resumos e Planilhas Automáticas:** Gera *briefings* formatados para WhatsApp e exporta planilhas detalhadas em `.csv` (Excel) para planejamentos de 3 ou 4 semanas.
  * **Conversor de Imagens para PDF:** Área de *drag-and-drop* para compilar fotos de recibos e notas fiscais em um único PDF localmente (`jsPDF`).
  * **Controle de Manutenções:** Registro de chamados físicos por sala/setor com geração de relatório consolidado.
* **💰 Cotações e Compras (Aba Orçamento):**
  * Tabela comparativa com cálculo automático de frete, valor unitário e destaque de menor preço (`🏆`).
  * Higienizador e encurtador integrado de links de compra.
  * Gráfico de barras comparativo e linha do tempo histórica de variação de preços por item.
* **📝 Produtividade e Segurança:**
  * Gaveta lateral de **Lembretes Rápidos** (`Alt + N`).
  * Exportação e restauração de backups completos em `.json`, limpeza cirúrgica de registros antigos e *snapshot* oculto de emergência para desfazer restaurações acidentais.

---

## 🏗️ Arquitetura e Tecnologias

O projeto segue uma arquitetura modular em **JavaScript Vanilla (ES6+)** e **CSS3 nativo**, priorizando velocidade de carregamento e facilidade de manutenção:

* **Persistência:** `localStorage` no navegador (com arquitetura preparada para sincronização futura via **Supabase**).
* **Bibliotecas Externas (via CDN sob demanda):**
  * `pdf.js` — Leitura e extração de texto de cronogramas em PDF.
  * `jsPDF` — Geração local de documentos PDF a partir de imagens.

---

## 📂 Estrutura de Arquivos

```text
painel-operacional-prius/
├── index.html        # Estrutura principal da interface e carregamento dos módulos
├── style.css         # Estilização nativa, tema escuro (Dark Mode) e responsividade
├── core.js           # Estado global (S), utilitários de data/moeda e persistência
├── aulas.js          # Motor de importação PDF, diff de cronogramas e quadro de aulas
├── operacional.js    # Recibos, manutenções, resumos, planilhas CSV e conversor PDF
├── orcamento.js      # Cotações, encurtador de URLs, gráficos e histórico de preços
├── app.js            # Orquestrador central, roteamento de telas e ouvintes de eventos
├── snake.js          # Easter Egg isolado (jogo da cobrinha em Canvas)
├── .gitignore        # Proteção contra envio acidental de arquivos de backup (.json)
└── README.md         # Documentação técnica do repositório
```

---

## 🚀 Como Executar e Publicar

### Execução Local
Como não há dependências de backend ou *bundlers*, basta abrir o arquivo `index.html` diretamente em qualquer navegador moderno (Chrome, Edge, Firefox) ou utilizar uma extensão como *Live Server* no VS Code.

### Hospedagem no GitHub Pages
1. Faça o *push* dos arquivos para a branch `main` do repositório.
2. No GitHub, acesse **Settings > Pages**.
3. Em **Build and deployment > Source**, selecione **Deploy from a branch**.
4. Escolha a branch **`main`** e a pasta **`/ (root)`**, depois clique em **Save**.
5. Em instantes, o painel estará acessível via link HTTPS seguro.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Alt + N` | Abre ou fecha a gaveta lateral de Lembretes Rápidos |
| `Enter` | Fixa a pesquisa nos campos de busca (sem recarregar a página) ou avança campos de cadastro |
| `Esc` | Fecha a gaveta de lembretes ou janelas sobrepostas |

---

## 🔒 Segurança de Dados e Backups

* **Isolamento por Navegador:** Os dados ficam salvos localmente no navegador utilizado. Ao trocar de máquina ou migrar do arquivo local (`file://`) para o link do GitHub Pages, utilize a aba **⚙️ Configurações** para exportar o arquivo `.json` e importá-lo no novo ambiente.
* **Privacidade no Repositório:** Certifique-se de manter `*.json` listado no arquivo `.gitignore` para nunca enviar dados reais de docentes ou cotações para o controle de versão.