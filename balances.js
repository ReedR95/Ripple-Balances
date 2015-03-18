var async = require('async'),
    Remote = require('ripple-lib').Remote,
    Amount = require('ripple-lib').Amount,
    colors = require('colors');

var remote = new Remote({
    servers: ['wss://s1.ripple.com:443']
});

var balances = {
    accounts: {},
    totals: {}
}

if (process.argv.length < 3) {
    console.log('\nError: please provide account numbers as command line arguments\n'.red);
} else {
    remote.connect(function() {
        async.eachSeries(process.argv.slice(2), printAccountBalances, function(err) {
            if (err) {
                console.log(err);
            } else {
                printTotals();
                remote.disconnect();
            }
        });
    });
}

function hex2ascii(hex) {
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}
        
function getXRP(options, callback) {
    remote.requestAccountInfo(options, function(err, info) {
        if (err) {
            callback(err);
        } else {
            var balance = info.account_data.Balance;
            balances['accounts'][options.account]['XRP'] = balance;

            if ('XRP' in balances['totals']) {
                balances['totals']['XRP'] += parseFloat(balance);
            } else {
                balances['totals']['XRP'] = parseFloat(balance);
            }

            callback(null);
        }
    });
}

function getLines(options, callback) {
    remote.requestAccountLines(options, function(err, info) {
        if (err) {
            callback(err);
        } else {
            info.lines.forEach(function(l) {
                var currency = l.currency;
                var balance = l.balance;
                console.log(currency);

                // Check for demurrage currency
                if (currency.substring(0,2) === '01') {
                    var demAmount = Amount.from_json(l.balance + '/' +
                                                     l.currency + '/' +
                                                     l.account);
                    demAmount = demAmount.applyInterest(new Date());

                    balance = demAmount.to_json().value;
                    currency = hex2ascii(currency.substring(2,8));
                }

                balances['accounts'][options.account]['lines'].push({
                    currency: currency,
                    balance: balance,
                    account: l.account
                });

                if (currency in balances['totals']) {
                    balances['totals'][currency] += parseFloat(balance);
                } else {
                    balances['totals'][currency] = parseFloat(balance);
                }
            });

            callback(null);
        }
    });
}

function printXRP(options, callback) {
    console.log(colors.underline.yellow('XRP:'));
    console.log(colors.green(balances['accounts'][options.account]['XRP']) + colors.magenta(' XRP'));
    callback(null);
}

function printLines(options, callback) {
    console.log(colors.underline.yellow('\nIOUs:'));
    balances['accounts'][options.account]['lines'].forEach(function(l) {
        console.log(colors.green(l.balance) + ' ' + colors.magenta(l.currency) + ' - from ' + l.account);
    });
    callback(null);
}

function printTotals() {
    console.log(colors.underline.blue('\n\nTotal balances across accounts:\n'));
    for (var key in balances['totals']) {
        console.log(key + ': ' + colors.green(balances['totals'][key]));
    }
    console.log('\n');
}

function printAccountBalances(accountNum, callback) {
    console.log(colors.blue('\n\nAccount: ' + accountNum + '\n'));

    var options = {
        account: accountNum,
        ledger: 'validated'
    };

    balances['accounts'][accountNum] = {
        XRP: 0,
        lines: []
    };

    async.series([
        function(c) {
            getXRP(options, c);
        },
        function(c) {
            getLines(options, c);
        },
        function(c) {
            printXRP(options, c);
        },
        function(c) {
            printLines(options, c);
        },
        function(c) {
            callback();
        }
    ]);
}
