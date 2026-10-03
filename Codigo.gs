// ===== Cajazeiras Mall: servidor (Google Apps Script) =====
var SENHA = '#Lis2019'; // fica só aqui, nunca vai para a página dos visitantes

var CATEGORIAS_INICIAIS = ['Alimentação','Beleza','Eletrônicos','Mercado','Moda','Padaria','Pet Shop','Reforço Escolar','Saúde'];
var COMERCIOS_INICIAIS = [
  ['Reforço Escolar Tia Sandra','Reforço Escolar','85997354638','Trabalho com reforço escolar para educação infantil e ensino fundamental I.'],
  ['Jamille Araújo Espaço da Beleza e do Bronze','Beleza','85988961380','Cílios, sobrancelhas, depilação, unhas, massagem relaxante, limpeza de pele, banho de lua e bronze.'],
  ['Nayanne Nascimento Salão de Beleza','Beleza','85921490223','Serviços de alisamentos, loiros, coloração, corte, hidratação, reconstrução e penteados.'],
  ['Boomerang Sanduíches','Alimentação','85987012328','Hamburgueria com opções de sanduíches e lanches.'],
  ['Farmácia Super Farma','Saúde','85996656572','O super cuidado para sua saúde!'],
  ['Barfruta','Alimentação','85988408564','Polpas de frutas de diversos sabores e morango congelado.'],
  ['Alemão e Cléa Espetaria e Pratinhos','Alimentação','85996277402','Espetos variados e pratinhos tradicionais.'],
  ['Amadas Artigos Femininos, Fardamentos e Acessórios','Moda','85996482898','• Moda Feminina, Masculina e Infantil\n• Fardamentos\n• Acessórios']
];
var FEEDS = [
  {tag:'Cultura & Arte Local', fonte:'Diário do Nordeste (Verso)', url:'https://diariodonordeste.verdesmares.com.br/cetv-verso-rss'},
  {tag:'Cidade & Vida Urbana', fonte:'Diário do Nordeste', url:'https://diariodonordeste.verdesmares.com.br/ceara-rss'},
  {tag:'Turismo & Gastronomia', fonte:'O POVO (Vida & Arte)', url:'https://www.opovo.com.br/rss/vidaearte'}
];
var PROIBIDOS = ['crime','preso','morte','matou','tiro','polícia','pf','stf','eleição','eleições','candidato','assassino','roubo','assalto','bomba','incêndio','droga'];

function aba_(nome, cabecalho) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var a = ss.getSheetByName(nome);
  if (!a) { a = ss.insertSheet(nome); a.appendRow(cabecalho); }
  return a;
}
function seguro_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function preparar_() {
  var c = aba_('Categorias', ['nome']);
  if (c.getLastRow() < 2) CATEGORIAS_INICIAIS.forEach(function (n) { c.appendRow([n]); });
  var m = aba_('Comercios', ['id','nome','categoria','whatsapp','desc']);
  if (m.getLastRow() < 2) COMERCIOS_INICIAIS.forEach(function (x) { m.appendRow([Utilities.getUuid(), x[0], x[1], "'" + x[2], x[3]]); });
}
function estado_() {
  preparar_();
  var cats = aba_('Categorias', ['nome']).getDataRange().getValues().slice(1)
    .map(function (r) { return String(r[0]); }).filter(String)
    .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  var coms = aba_('Comercios', ['id','nome','categoria','whatsapp','desc']).getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return {id:String(r[0]), nome:String(r[1]), categoria:String(r[2]), whatsapp:String(r[3]).replace(/\D/g,''), desc:String(r[4])}; });
  return {ok:true, categorias:cats, comercios:coms};
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function noticias_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('noticias_v1');
  if (guardado) return JSON.parse(guardado);
  var saida = FEEDS.map(function (f) {
    var itens = [];
    try {
      var xml = UrlFetchApp.fetch(f.url, {muteHttpExceptions:true}).getContentText();
      var canal = XmlService.parse(xml).getRootElement().getChild('channel');
      canal.getChildren('item').forEach(function (it) {
        if (itens.length >= 5) return;
        var titulo = it.getChildText('title') || '';
        var resumo = (it.getChildText('description') || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        var texto = (titulo + ' ' + resumo).toLowerCase();
        var ruim = PROIBIDOS.some(function (t) { return texto.indexOf(t) > -1; });
        if (!ruim && titulo) itens.push({titulo:titulo, link:it.getChildText('link') || '', data:it.getChildText('pubDate') || '', resumo:resumo.substring(0, 110)});
      });
    } catch (e) {}
    return {tag:f.tag, fonte:f.fonte, itens:itens};
  });
  var res = {ok:true, noticias:saida};
  cache.put('noticias_v1', JSON.stringify(res), 1800);
  return res;
}

function doGet(e) {
  var acao = (e && e.parameter && e.parameter.acao) || 'listar';
  if (acao === 'noticias') return json_(noticias_());
  return json_(estado_());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var p = JSON.parse(e.postData.contents);
    var cache = CacheService.getScriptCache();
    var falhas = parseInt(cache.get('falhas') || '0', 10);
    if (falhas >= 5) return json_({ok:false, erro:'Muitas tentativas. Aguarde 10 minutos.'});
    if (p.senha !== SENHA) {
      cache.put('falhas', String(falhas + 1), 600);
      return json_({ok:false, erro:'Senha incorreta.'});
    }
    cache.remove('falhas');
    preparar_();
    var m = aba_('Comercios', ['id','nome','categoria','whatsapp','desc']);
    var c = aba_('Categorias', ['nome']);
    var acao = p.acao;

    if (acao === 'login') return json_(estado_());

    if (acao === 'salvar') {
      var x = p.comercio || {};
      var nome = String(x.nome || '').trim().substring(0, 90);
      var cat = String(x.categoria || '').trim();
      var zap = String(x.whatsapp || '').replace(/\D/g, '');
      var desc = String(x.desc || '').trim().substring(0, 500);
      var cats = estado_().categorias;
      if (!nome || !desc) return json_({ok:false, erro:'Preencha nome e descrição.'});
      if (cats.indexOf(cat) < 0) return json_({ok:false, erro:'Categoria inválida.'});
      if (zap.length < 10 || zap.length > 13) return json_({ok:false, erro:'WhatsApp inválido.'});
      var linha = [x.id || Utilities.getUuid(), seguro_(nome), cat, "'" + zap, seguro_(desc)];
      var dados = m.getDataRange().getValues();
      var achou = 0;
      if (x.id) for (var i = 1; i < dados.length; i++) if (String(dados[i][0]) === String(x.id)) { achou = i + 1; break; }
      if (achou) m.getRange(achou, 1, 1, 5).setValues([linha]); else m.appendRow(linha);
      return json_(estado_());
    }
    if (acao === 'excluir') {
      var d2 = m.getDataRange().getValues();
      for (var j = d2.length - 1; j >= 1; j--) if (String(d2[j][0]) === String(p.id)) m.deleteRow(j + 1);
      return json_(estado_());
    }
    if (acao === 'cat_add') {
      var n = String(p.nome || '').trim().substring(0, 40);
      if (!n) return json_({ok:false, erro:'Digite o nome.'});
      if (estado_().categorias.some(function (k) { return k.toLowerCase() === n.toLowerCase(); })) return json_({ok:false, erro:'Essa categoria já existe.'});
      c.appendRow([seguro_(n)]);
      return json_(estado_());
    }
    if (acao === 'cat_ren') {
      var para = String(p.para || '').trim().substring(0, 40);
      if (!para) return json_({ok:false, erro:'Digite o novo nome.'});
      var dc = c.getDataRange().getValues();
      for (var a = 1; a < dc.length; a++) if (String(dc[a][0]) === p.de) c.getRange(a + 1, 1).setValue(seguro_(para));
      var dm = m.getDataRange().getValues();
      for (var b = 1; b < dm.length; b++) if (String(dm[b][2]) === p.de) m.getRange(b + 1, 3).setValue(seguro_(para));
      return json_(estado_());
    }
    if (acao === 'cat_del') {
      if (estado_().comercios.some(function (k) { return k.categoria === p.nome; })) return json_({ok:false, erro:'Há comércios nessa categoria. Mude ou exclua antes.'});
      var d3 = c.getDataRange().getValues();
      for (var q = d3.length - 1; q >= 1; q--) if (String(d3[q][0]) === p.nome) c.deleteRow(q + 1);
      return json_(estado_());
    }
    return json_({ok:false, erro:'Ação desconhecida.'});
  } catch (err) {
    return json_({ok:false, erro:'Erro no servidor.'});
  } finally {
    lock.releaseLock();
  }
}
