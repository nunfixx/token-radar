// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, the filters, a per-protocol detail view with the model's own inputs
// and the protocol's farm plan, and the live-token set kept apart from the ranking. No network:
// every byte it shows is in data.js.
//
// Two derivations live here as well as in lib/model.ts, in the same words, so the page and the
// board agree: the implied value (recomputed from the row's own figures) and the farm plan
// (category, chains, TVL and age decide the action, the capital, the hold and every cost and
// time). No protocol name is special-cased anywhere.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var $ = function (id) { return document.getElementById(id); };
  var usdFull = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFull.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n.toFixed(4); }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var maturity = row.age_days === null || row.age_days === undefined
      ? model.unknown_maturity
      : model.maturity_floor + (Math.min(Math.max(row.age_days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainCount = Math.max((row.chains || []).length, 1);
    var chainMult = 1 + model.chain_log_step * Math.min(Math.log(chainCount), Math.log(model.chain_log_cap));
    var categoryMult = row.category_family === 'primitive' ? model.category_primitive
      : row.category_family === 'yield' ? model.category_yield : model.category_other;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMult * categoryMult));
  }
  function factorsOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var maturity = row.age_days === null || row.age_days === undefined
      ? model.unknown_maturity
      : model.maturity_floor + (Math.min(Math.max(row.age_days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainCount = Math.max((row.chains || []).length, 1);
    var chainMult = 1 + model.chain_log_step * Math.min(Math.log(chainCount), Math.log(model.chain_log_cap));
    var categoryMult = row.category_family === 'primitive' ? model.category_primitive
      : row.category_family === 'yield' ? model.category_yield : model.category_other;
    return { growthPct: growth, growthMult: growthMult, maturityMult: maturity, chainMult: chainMult, categoryMult: categoryMult, chainCount: chainCount };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function gasFor(chain) { return chain === 'Ethereum' ? 8 : 2; }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function coreAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('stable') >= 0 || c.indexOf('reserve currency') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s basis trade on " + chain + ' and keep the position open.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use it in one app there.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function deepenAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.max(25, Math.round(capital / 2));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + half + ' of USDC against the supply on ' + name + ' and route it back into the same market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Add a second $' + half + " position in " + name + "'s highest-volume pool on " + chain + '.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 'Open a second, smaller hedge on ' + name + ' in the opposite direction.';
    if (c.indexOf('stable') >= 0 || c.indexOf('reserve currency') >= 0) return 'Deposit a further $' + half + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the receipt token through ' + name + ' so the position compounds.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Allocate $' + half + ' to a second ' + name + ' vault on ' + chain + '.';
    if (c.indexOf('basis trading') >= 0) return 'Add $' + half + ' to the basis trade so the position earns through the next funding round.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $' + half + ' position on a different ' + name + ' market.';
    if (c.indexOf('rwa') >= 0) return 'Mint a second $' + half + ' tranche of the yield asset on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Extend the cover by $' + half + ' so the policy runs through the next quarter.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a further $' + half + ' of USDC to ' + chain + ' through ' + name + '.';
    if (c.indexOf('chain') >= 0) return 'Use the bridged funds in a second app on ' + name + "'s chain.";
    return 'Increase the position by $' + half + ' of USDC on ' + name + '.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasFor(chain);
    var hold = holdDaysFor(p.age_days);
    var half = Math.max(25, Math.round(capital / 2));
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      chain === 'Ethereum'
        ? { text: 'Buy $' + capital + ' of USDC on Ethereum and hold it in the fresh wallet.', cost: 'about $' + gas + ' of gas', time: '10 minutes' }
        : { text: 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' and hold it in the fresh wallet.', cost: 'about $6 of bridge fees and gas', time: '10 to 25 minutes' },
      { text: coreAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: deepenAction(p, capital, chain), cost: 'about $' + half + ' of extra capital and about $' + gas + ' of gas', time: '10 minutes' }
    ];
    if (secondChain !== null) {
      steps.push({ text: 'Repeat the core position with $' + half + ' on ' + secondChain + ', so the wallet is active on two chains.', cost: 'about $' + half + ' of extra capital and about $2 of gas', time: '15 minutes' });
    }
    steps.push(
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: "Hold the position for at least " + hold + " days and check the protocol's own points or rewards page weekly, so the activity is counted in more than one snapshot.", cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "When a token is announced, claim only from the link the protocol's own page publishes, and write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' }
    );
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortButton(key, label) {
    var arrow = state.sort === key ? ' <span class="arrow" aria-hidden="true">' + (state.dir < 0 ? '▼' : '▲') + '</span>' : '';
    return '<button type="button" data-sort="' + key + '">' + label + arrow + '</button>';
  }
  function renderHead() {
    var thead = document.querySelector('#board-table thead tr');
    if (state.tab === 'live') {
      thead.innerHTML = '<th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th>';
    } else {
      thead.innerHTML = '<th scope="col">' + sortButton('rank', 'Rank') + '</th>' +
        '<th scope="col">' + sortButton('name', 'Protocol') + '</th>' +
        '<th scope="col">' + sortButton('tvl', 'TVL') + '</th>' +
        '<th scope="col">' + sortButton('growth', '7d') + '</th>' +
        '<th scope="col">' + sortButton('age', 'Age') + '</th>' +
        '<th scope="col">' + sortButton('implied', 'Implied value') + '</th>' +
        '<th scope="col">Token</th>';
    }
    thead.querySelectorAll('button[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        render();
      });
    });
  }
  function rowHtml(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    var chainText = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
    var pct = Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chainText) + '</span></div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + growthClass + '">' + growth + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
      '<td><span class="status">no token</span></td></tr>';
  }
  function liveRowHtml(r) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    var chainText = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
    return '<tr tabindex="0"><td class="num">live</td>' +
      '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chainText) + '</span></div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + growthClass + '">' + growth + '</td>' +
      '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
      '<td><span class="status live">already trades</span></td></tr>';
  }

  var dialog = $('detail');
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var f = factorsOf(row, DATA.model);
    var recomputed = impliedOf(row, DATA.model);
    $('detail-kicker').textContent = 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.category_family === 'primitive' ? 'money primitive' : row.category_family === 'yield' ? 'yield & allocation' : 'other');
    $('detail-title').textContent = row.name;
    $('detail-sub').textContent = (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain');
    var eq = [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Seven-day growth (clamped ' + DATA.model.growth_floor + '% to ' + DATA.model.growth_cap + '%)', fmtPct(f.growthPct)],
      ['Age with no token', fmtAge(row.age_days)],
      ['Growth multiplier', fmtMult(f.growthMult)],
      ['Maturity multiplier', fmtMult(f.maturityMult)],
      ['Chain breadth ×' + f.chainCount + ' chain' + (f.chainCount === 1 ? '' : 's'), fmtMult(f.chainMult)],
      ['Category multiplier (' + row.category_family + ')', fmtMult(f.categoryMult)]
    ];
    $('detail-equation').innerHTML = eq.map(function (pair) {
      return '<div><span>' + esc(pair[0]) + '</span><b>' + esc(pair[1]) + '</b></div>';
    }).join('') + '<div class="total"><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>';
    $('detail-check').textContent = 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) +
      (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
      ' This is an estimate, not a price.';
    var steps = farmSteps(row);
    $('detail-steps').innerHTML = steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  $('detail-close').addEventListener('click', function () { dialog.close(); });

  function render() {
    renderHead();
    var tbody = $('rows');
    var empty = $('empty');
    if (state.tab === 'live') {
      $('table-caption').textContent = 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.';
      tbody.innerHTML = DATA.live.map(liveRowHtml).join('');
      empty.hidden = true;
      $('count').textContent = DATA.live.length + ' live-token protocols';
    } else {
      $('table-caption').textContent = 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
      var list = sortedRows(filteredRows());
      var max = (list[0] && list[0].implied_value_usd) || 1;
      tbody.innerHTML = list.map(function (r) { return rowHtml(r, max); }).join('');
      empty.hidden = list.length !== 0;
      $('count').textContent = list.length + ' rows shown';
    }
    tbody.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
    $('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    if (state.selected) openDetail(state.selected);
  }

  function initStatic() {
    $('meta-asof').textContent = 'Snapshot ' + DATA.as_of;
    $('meta-model').textContent = DATA.model_version + ' model';
    $('headline').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    $('lede-text').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) +
      'M of TVL and no token on record. The early radar adds ' + DATA.early_size +
      ' pre-token protocols below that floor, and the genuine candidates above it the watchlist rule left out. Implied value is a model, not a promise.';
    $('fact-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
    $('fact-board').textContent = String(DATA.board_size);
    $('fact-early').textContent = String(DATA.early_size);
    $('fact-live').textContent = String(DATA.live_size);
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = $('category');
    categories.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === state.category) o.selected = true;
      catSel.appendChild(o);
    });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = $('chain');
    chains.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === state.chain) o.selected = true;
      chainSel.appendChild(o);
    });
    var m = DATA.model;
    $('formula').textContent = 'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x maturity x breadth x category )';
    var factorCards = [
      ['TVL anchor', 'tvl_usd x ' + m.base_multiple + ' — a token is worth a fraction of the value the protocol already secures.'],
      ['Growth', '1 + clamped 7-day change x ' + m.growth_weight + ' — momentum rewarded, shrinkage punished, one wild week capped.'],
      ['Maturity', m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + 'd x ' + m.maturity_range + ' — survival with no token; unknown age is neutral at ' + m.unknown_maturity + '.'],
      ['Breadth', '1 + ' + m.chain_log_step + ' x min(ln(chains), ln(' + m.chain_log_cap + ')) — more chains, wider distribution, diminishing returns.'],
      ['Category', 'x' + m.category_primitive + ' primitives, x' + m.category_yield + ' yield & allocation, x' + m.category_other + ' the rest — fee-capturing primitives carry the most value per TVL dollar.']
    ];
    $('factors').innerHTML = factorCards.map(function (card) {
      return '<div class="factor"><b>' + esc(card[0]) + '</b><span>' + esc(card[1]) + '</span></div>';
    }).join('');
    $('model-note').textContent = 'TVL, seven-day growth and age come from the snapshot. The early radar is every pre-token protocol below the watchlist floor, plus the genuine pre-token candidates above it the watchlist rule left out; wrapped, staked and bridged products of tokens that already trade are never ranked above the floor. Live-token protocols are set aside with their market caps shown.';
    $('foot-source').textContent = 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '.';
  }

  $('q').addEventListener('input', function () { state.q = $('q').value; writeHash(); render(); });
  $('category').addEventListener('change', function () { state.category = $('category').value; writeHash(); render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; writeHash(); render(); });
  $('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); render(); });
  $('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  $('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all';
    $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all';
    writeHash(); render();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });

  readHash();
  $('q').value = state.q;
  initStatic();
  render();
})();
