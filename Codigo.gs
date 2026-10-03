// ==========================================
// CONFIGURAÇÕES GERAIS
// ==========================================
var SENHA = '#Lis2019'; // Altere sua senha de admin aqui se desejar
var ID_PLANILHA = SpreadsheetApp.getActiveSpreadsheet().getId();

var FEEDS = [
  { tag: 'Ceará', fonte: 'Diário do Nordeste', url: 'https://diariodonordeste.verdesmares.com.br/corta-fogo/rss' },
  { tag: 'Fortaleza', fonte: 'O POVO', url: 'https://www.opovo.com.br/rss' }
];

var PROIBIDOS = ['crime', 'assassino', 'homicidio', 'chacina', 'morto', 'morte', 'preso', 'faccao', 'tiroteio', 'assalto', 'roubo'];

// ==========================================
// PONTO DE ENTRADA HTTP (GET)
// ==========================================
function doGet(e) {
  var acao = (e && e.parameter && e.parameter.acao) ? e.parameter.acao : 'comercios';
  var resultado = {};

  try {
    if (acao === 'comercios') {
      resultado = comercios_();
    } else if (acao === 'noticias') {
      resultado = noticias_();
    } else {
      resultado = { ok: false, erro: 'Ação inválida' };
    }
  } catch (err) {
    resultado = { ok: false, erro: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// PONTO DE ENTRADA HTTP (POST)
// ==========================================
function doPost(e) {
  var resultado = {};
  try {
    var dados = JSON.parse(e.postData.contents);
    if (dados.senha !== SENHA) {
      resultado = { ok: false, erro: 'Senha incorreta' };
    } else if (dados.acao === 'salvarComercio') {
      resultado = salvarComercio_(dados.comercio);
    } else if (dados.acao === 'excluirComercio') {
      resultado = excluirComercio_(dados.id);
    } else {
      resultado = { ok: false, erro: 'Ação POST inválida' };
    }
  } catch (err) {
    resultado = { ok: false, erro: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// BUSCAR COMÉRCIOS
// ==========================================
function comercios_() {
  var aba = SpreadsheetApp.openById(ID_PLANILHA).getSheetByName('Comercios');
  if (!aba) return { ok: true, comercios: [] };
  
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return { ok: true, comercios: [] };

  var cabecalho = dados[0];
  var lista = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (!linha[0]) continue; // Pula se ID estiver vazio
    var obj = {};
    for (var j = 0; j < cabecalho.length; j++) {
      obj[cabecalho[j]] = linha[j];
    }
    lista.push(obj);
  }

  return { ok: true, comercios: lista };
}

// ==========================================
// BUSCAR NOTÍCIAS (CORRIGIDO E ROBUSTO)
// ==========================================
function noticias_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('noticias_v2');
  if (guardado) return JSON.parse(guardado);
  
  var saida = FEEDS.map(function (f) {
    var itens = [];
    try {
      var resp = UrlFetchApp.fetch(f.url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      
      if (resp.getResponseCode() === 200) {
        var xml = resp.getContentText();
        var doc = XmlService.parse(xml);
        var root = doc.getRootElement();
        var channel = root.getChild('channel') || root;
        var items = channel.getChildren('item');
        
        for (var i = 0; i < items.length; i++) {
          if (itens.length >= 5) break;
          var it = items[i];
          var titulo = it.getChildText('title') || '';
          var desc = it.getChildText('description') || '';
          var link = it.getChildText('link') || '';
          var pubDate = it.getChildText('pubDate') || '';
          
          var resumo = desc.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          var texto = (titulo + ' ' + resumo).toLowerCase();
          
          var ruim = PROIBIDOS.some(function (t) { return texto.indexOf(t) > -1; });
          
          if (!ruim && titulo) {
            itens.push({
              titulo: titulo,
              link: link,
              data: pubDate,
              resumo: resumo.substring(0, 120)
            });
          }
        }
      }
    } catch (e) {
      // Caso um feed específico falhe, segue para o próximo sem derrubar a API
    }
    return { tag: f.tag, fonte: f.fonte, itens: itens };
  });
  
  var res = { ok: true, noticias: saida };
  cache.put('noticias_v2', JSON.stringify(res), 1800); // Cache por 30 min
  return res;
}

// ==========================================
// SALVAR OU EDITAR COMÉRCIO
// ==========================================
function salvarComercio_(c) {
  var aba = SpreadsheetApp.openById(ID_PLANILHA).getSheetByName('Comercios');
  if (!aba) {
    aba = SpreadsheetApp.openById(ID_PLANILHA).insertSheet('Comercios');
    aba.appendRow(['id', 'nome', 'categoria', 'descricao', 'whatsapp', 'instagram', 'endereco', 'foto']);
  }

  var dados = aba.getDataRange().getValues();
  var id = c.id || 'id_' + new Date().getTime();
  var linhaExistente = -1;

  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] == id) {
      linhaExistente = i + 1;
      break;
    }
  }

  var novaLinha = [id, c.nome, c.categoria, c.descricao, c.whatsapp, c.instagram, c.endereco, c.foto];

  if (linhaExistente > 0) {
    aba.getRange(linhaExistente, 1, 1, novaLinha.length).setValues([novaLinha]);
  } else {
    aba.appendRow(novaLinha);
  }

  return { ok: true, id: id };
}

// ==========================================
// EXCLUIR COMÉRCIO
// ==========================================
function excluirComercio_(id) {
  var aba = SpreadsheetApp.openById(ID_PLANILHA).getSheetByName('Comercios');
  if (!aba) return { ok: false, erro: 'Aba não encontrada' };

  var dados = aba.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] == id) {
      aba.deleteRow(i + 1);
      return { ok: true };
    }
  }

  return { ok: false, erro: 'ID não encontrado' };
}
