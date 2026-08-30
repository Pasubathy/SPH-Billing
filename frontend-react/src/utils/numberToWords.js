export function numberToWords(num) {
    if (isNaN(num) || num === null || num === undefined || num === 0) return 'Zero Rupees Only';
    
    num = parseFloat(num);
    if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(n) {
        if (n < 20) return a[n];
        const digit = n % 10;
        return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
    }

    const whole = Math.floor(num);
    const decimal = Math.round((num - whole) * 100);

    let str = '';
    const crore = Math.floor(whole / 10000000);
    const remainderCrore = whole % 10000000;
    const lakh = Math.floor(remainderCrore / 100000);
    const remainderLakh = remainderCrore % 100000;
    const thousand = Math.floor(remainderLakh / 1000);
    const remainderThousand = remainderLakh % 1000;
    const hundred = Math.floor(remainderThousand / 100);
    const tens = remainderThousand % 100;

    if (crore > 0) str += inWords(crore) + ' Crore ';
    if (lakh > 0) str += inWords(lakh) + ' Lakh ';
    if (thousand > 0) str += inWords(thousand) + ' Thousand ';
    if (hundred > 0) str += inWords(hundred) + ' Hundred ';
    if (tens > 0) {
        if (str !== '') str += 'and ';
        str += inWords(tens) + ' ';
    }

    str = str.trim() + ' Rupees';

    if (decimal > 0) {
        str += ' and ' + inWords(decimal) + ' Paise';
    }

    return str + ' Only';
}
