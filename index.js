const DEBUG = true;

class GB {
    running = false;
    loggers = [];

    constructor(){
        this.checkBrowser();
        this.log = this.createLogger('gb:system');

        this.mmu = new MMU(this);
        this.cpu = new CPU(this);
        this.key = new Key(this);
        this.gpu = new GPU(this, 'canvas');
        this.timer = new Timer(this);
    }

    reset(){
        this.cpu.reset();
        this.mmu.reset();
        this.key.reset();
        this.gpu.reset();
        this.timer.reset();
    }

    run(){
        this.running = true;
        this.step();
    }

    stop(){
        this.running = false;
    }

    step(){
        this.cpu.step();
        this.gpu.step();
        if(this.running){
            setTimeout(() => this.step(), 10);
        }
    }

    checkBrowser(){
        let checks = [
            {
                name: 'TypedArray',
                required: true,
                check: () => 'ArrayBuffer' in window
            },
            {
                name: 'FileApi',
                required: true,
                check: () => !!window.File && !!window.FileReader && !!window.FileList && !!window.Blob
            },
            {
                name: 'BlobBuilder',
                required: false,
                check: () => window.MozBlobBuilder || window.WebKitBlobBuilder || window.BlobBuilder
            },
            {
                name: 'XMLHttpRequest2',
                required: true,
                check: () => !!(new XMLHttpRequest().upload)
            },
            {
                name: 'Canvas',
                required: true,
                check: () => { var e = document.createElement('canvas'); return !!(e.getContext && e.getContext('2d')); }
            },
            {
                name: 'Gamepad',
                required: false,
                check: () => !!navigator.webkitGetGamepads || !!navigator.webkitGamepads || !!navigator.getGamepads || !! navigator.gamepads || !!navigator.mozGetGamepads || !!navigator.mozGamepads
            },
            {
                name: 'Console',
                required: false,
                check: () => 'object' === typeof console && console.log
            },
            {
                name: 'ConsoleColors',
                required: false,
                check: () => ('WebkitAppearance' in document.documentElement.style) || (window.console && (console.firebug || (console.exception && console.table))) || (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31)
            }
        ];

        let passed = true;
        let passedChecks = {};

        checks.forEach(function(check){
            let checkPassed = check.check();
            if(!checkPassed && check.required){
                passed = false;
            }
            passedChecks[check.name] = checkPassed;
            'object' === typeof console && console.log && console.log('BrowserCheck', check.name, checkPassed ? '✓' : '✕');
        });

        if(!passed){
            let notPassed = checks.filter(check => check.required && !passedChecks[check.name]).map(check => `✕ ${check.name}\r\n`);
            alert(`There are some BrowserChecks which have not passed:\r\n${notPassed}`);
        }

        this.passedChecks = passedChecks;
        return passed;
    }

    createLogger(system){
        let colors = ["lightseagreen", "forestgreen", "goldenrod", "dodgerblue", "darkorchid", "crimson"];
        let color = colors[Math.floor(Math.random() * colors.length)];
        let logger = (...args) => {
            if(this.passedChecks.Console && this.isLoggerEnabled(system)){
                let logEntry = [];
                if(this.passedChecks.ConsoleColors){
                    logEntry.push('%c' + system);
                    logEntry.push('color:' + color);
                } else {
                    logEntry.push(system);
                }
                logEntry.concat(args);

                console.log(...logEntry, ...args);
            }
        }
        this.loggers[system] = logger;
        return logger;
    }
    enableLogger(wildcard){

    }
    isLoggerEnabled(system){
        return true;
    }

}

let binaryFromFile = function(inputId, fn){
    let input = document.getElementById(inputId);
    if(!input){
        return setTimeout(() => fn(false), 0);
    }
    let files = input.files;
    if(files.length <= 0){
        return setTimeout(() => fn(false), 0);
    }
    let file = files[0];
    let reader = new FileReader();

    reader.onload = e => {
        return fn(new Uint8Array(e.target.result));
    };

    reader.readAsArrayBuffer(file);
};

let binaryFromUrl = function(url, fn){
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = e => {
        return fn(new Uint8Array(e.target.response));
    }

    xhr.send();
};

const REG_B = 2;
const REG_C = 3;
const REG_D = 4;
const REG_E = 5;
const REG_H = 6;
const REG_L = 7;
const REG_A = 0;
const REG_F = 1;

const REG_AF = 'regAF';
const REG_BC = 'regBC';
const REG_DE = 'regDE';
const REG_HL = 'regHL';
const REG_SP = 'regSP';
const REG_PC = 'regPC';

const FLAG_ZERO = 0x80;
const FLAG_SUBTRACT = 0x40;
const FLAG_HALF_CARRY = 0x20;
const FLAG_CARRY = 0x10;

class CPU {
    programCounter = 0;
    stackPointer = 0;
    registers = new Uint8Array(8);
    rRegisters = new Uint8Array(8);
    clock = { m: 0, t: 0 };
    clockRegister = { m: 0, t: 0 };
    halt = 0;
    interruptsEnabled = 1;
    positionBits = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]);
    invertedPositionBits = new Uint8Array([0xFE, 0xFD, 0xFB, 0xF7, 0xEF, 0xDF, 0xBF, 0x7F]);
    r = 0;

    doubleRegisters = {
        get regAF(){
            return this.cpu.getWordReg(REG_A, REG_F);
        },
        set regAF(val){
            this.cpu.setWordReg(REG_A, REG_F, val);
        },

        get regBC(){
            return this.cpu.getWordReg(REG_B, REG_C);
        },
        set regBC(val){
            this.cpu.setWordReg(REG_B, REG_C, val);
        },

        get regDE(){
            return this.cpu.getWordReg(REG_D, REG_E);
        },
        set regDE(val){
            this.cpu.setWordReg(REG_D, REG_E, val);
        },

        get regHL(){
            return this.cpu.getWordReg(REG_H, REG_L);
        },
        set regHL(val){
            this.cpu.setWordReg(REG_H, REG_L, val);
        },

        get regSP(){
            return this.cpu.stackPointer;
        },
        set regSP(val){
            this.cpu.stackPointer = val;
        },

        get regPC(){
            return this.cpu.programCounter;
        },
        set regPC(val){
            this.cpu.programCounter = val;
        }
    };

    opMap = [
        // 0x00
        () => this.opNOP(),
        () => this.opLD__dr_nn$pc(REG_BC),
        () => this.opLD__n$dr_rr(REG_BC, REG_A),
        () => this.opINC__dr(REG_BC),
        () => this.opINC__rr(REG_B),
        () => this.opDEC__rr(REG_B),
        () => this.opLD__rr_n$pc(REG_B),
        () => this.opRLC__a(),
        () => this.opLD__nn$nn$pc_dr(REG_HL),
        () => this.opADD__dr_dr(REG_HL, REG_BC),
        () => this.opLD__rr_n$dr(REG_A, REG_BC),
        () => this.opDEC__dr(REG_BC),
        () => this.opINC__rr(REG_C),
        () => this.opDEC__rr(REG_C),
        () => this.opLD__rr_n$pc(REG_C),
        () => this.opRRC__a(),

        // 0x10
        () => this.opDJNZ__n$pc(),
        () => this.opLD__dr_nn$pc(REG_DE),
        () => this.opLD__n$dr_rr(REG_DE, REG_A),
        () => this.opINC__dr(REG_DE),
        () => this.opINC__rr(REG_D),
        () => this.opDEC__rr(REG_D),
        () => this.opLD__rr_n$pc(REG_D),
        () => this.opRL__a(),
        () => this.opJR(),
        () => this.opADD__dr_dr(REG_HL, REG_DE),
        () => this.opLD__rr_n$dr(REG_A, REG_DE),
        () => this.opDEC__dr(REG_DE),
        () => this.opINC__rr(REG_E),
        () => this.opDEC__rr(REG_E),
        () => this.opLD__rr_n$pc(REG_E),
        () => this.opRR__a(),

        // 0x20
        () => this.opJR__flag(FLAG_ZERO, 0x00),
        () => this.opLD__dr_nn$pc(REG_HL),
        () => this.opLDI__n$dr_rr(REG_HL, REG_A),
        () => this.opINC__dr(REG_HL),
        () => this.opINC__rr(REG_H),
        () => this.opDEC__rr(REG_H),
        () => this.opLD__rr_n$pc(REG_H),
        () => this.opDAA(),
        () => this.opJR__flag(FLAG_ZERO, FLAG_ZERO),
        () => this.opADD__dr_dr(REG_HL, REG_HL),
        () => this.opLDI__rr_n$dr(REG_A, REG_HL),
        () => this.opDEC__dr(REG_HL),
        () => this.opINC__rr(REG_L),
        () => this.opDEC__rr(REG_L),
        () => this.opLD__rr_n$pc(REG_L),
        () => this.opCPL(),

        // 0x30
        () => this.opJR__flag(FLAG_CARRY, 0x00),
        () => this.opLD__dr_nn$pc(REG_SP),
        () => this.opLDD__n$dr_rr(REG_HL, REG_A),
        () => this.opINC__dr(REG_SP),
        () => this.opINC__n$dr(REG_HL),
        () => this.opDEC__n$dr(REG_HL),
        () => this.opLD__n$dr_n$pc(REG_HL),
        () => this.opSCF(),
        () => this.opJR__flag(FLAG_CARRY, FLAG_CARRY),
        () => this.opADD__dr_dr(REG_HL, REG_SP),
        () => this.opLDD__rr_n$dr(REG_A, REG_HL),
        () => this.opDEC__dr(REG_SP),
        () => this.opINC__rr(REG_A),
        () => this.opDEC__rr(REG_A),
        () => this.opLD__rr_n$pc(REG_A),
        () => this.opCCF(),

        // 0x40
        () => this.opLD__rr_rr(REG_B, REG_B),
        () => this.opLD__rr_rr(REG_B, REG_C),
        () => this.opLD__rr_rr(REG_B, REG_D),
        () => this.opLD__rr_rr(REG_B, REG_E),
        () => this.opLD__rr_rr(REG_B, REG_H),
        () => this.opLD__rr_rr(REG_B, REG_L),
        () => this.opLD__rr_n$dr(REG_B, REG_HL),
        () => this.opLD__rr_rr(REG_B, REG_A),
        () => this.opLD__rr_rr(REG_C, REG_B),
        () => this.opLD__rr_rr(REG_C, REG_C),
        () => this.opLD__rr_rr(REG_C, REG_D),
        () => this.opLD__rr_rr(REG_C, REG_E),
        () => this.opLD__rr_rr(REG_C, REG_H),
        () => this.opLD__rr_rr(REG_C, REG_L),
        () => this.opLD__rr_n$dr(REG_C, REG_HL),
        () => this.opLD__rr_rr(REG_C, REG_A),

        // 0x50
        () => this.opLD__rr_rr(REG_D, REG_B),
        () => this.opLD__rr_rr(REG_D, REG_C),
        () => this.opLD__rr_rr(REG_D, REG_D),
        () => this.opLD__rr_rr(REG_D, REG_E),
        () => this.opLD__rr_rr(REG_D, REG_H),
        () => this.opLD__rr_rr(REG_D, REG_L),
        () => this.opLD__rr_n$dr(REG_D, REG_HL),
        () => this.opLD__rr_rr(REG_D, REG_A),
        () => this.opLD__rr_rr(REG_E, REG_B),
        () => this.opLD__rr_rr(REG_E, REG_C),
        () => this.opLD__rr_rr(REG_E, REG_D),
        () => this.opLD__rr_rr(REG_E, REG_E),
        () => this.opLD__rr_rr(REG_E, REG_H),
        () => this.opLD__rr_rr(REG_E, REG_L),
        () => this.opLD__rr_n$dr(REG_E, REG_HL),
        () => this.opLD__rr_rr(REG_E, REG_A),

        // 0x60
        () => this.opLD__rr_rr(REG_H, REG_B),
        () => this.opLD__rr_rr(REG_H, REG_C),
        () => this.opLD__rr_rr(REG_H, REG_D),
        () => this.opLD__rr_rr(REG_H, REG_E),
        () => this.opLD__rr_rr(REG_H, REG_H),
        () => this.opLD__rr_rr(REG_H, REG_L),
        () => this.opLD__rr_n$dr(REG_H, REG_HL),
        () => this.opLD__rr_rr(REG_H, REG_A),
        () => this.opLD__rr_rr(REG_L, REG_B),
        () => this.opLD__rr_rr(REG_L, REG_C),
        () => this.opLD__rr_rr(REG_L, REG_D),
        () => this.opLD__rr_rr(REG_L, REG_E),
        () => this.opLD__rr_rr(REG_L, REG_H),
        () => this.opLD__rr_rr(REG_L, REG_L),
        () => this.opLD__rr_n$dr(REG_L, REG_HL),
        () => this.opLD__rr_rr(REG_L, REG_A),

        // 0x70
        () => this.opLD__n$dr_rr(REG_HL, REG_B),
        () => this.opLD__n$dr_rr(REG_HL, REG_C),
        () => this.opLD__n$dr_rr(REG_HL, REG_D),
        () => this.opLD__n$dr_rr(REG_HL, REG_E),
        () => this.opLD__n$dr_rr(REG_HL, REG_H),
        () => this.opLD__n$dr_rr(REG_HL, REG_L),
        () => this.opHALT(),
        () => this.opLD__n$dr_rr(REG_HL, REG_A),
        () => this.opLD__rr_rr(REG_A, REG_B),
        () => this.opLD__rr_rr(REG_A, REG_C),
        () => this.opLD__rr_rr(REG_A, REG_D),
        () => this.opLD__rr_rr(REG_A, REG_E),
        () => this.opLD__rr_rr(REG_A, REG_H),
        () => this.opLD__rr_rr(REG_A, REG_L),
        () => this.opLD__rr_n$dr(REG_A, REG_HL),
        () => this.opLD__rr_rr(REG_A, REG_A),

        // 0x80
        () => this.opADD__rr_rr(REG_A, REG_B),
        () => this.opADD__rr_rr(REG_A, REG_C),
        () => this.opADD__rr_rr(REG_A, REG_D),
        () => this.opADD__rr_rr(REG_A, REG_E),
        () => this.opADD__rr_rr(REG_A, REG_H),
        () => this.opADD__rr_rr(REG_A, REG_L),
        () => this.opADD__rr_n$dr(REG_A, REG_HL),
        () => this.opADD__rr_rr(REG_A, REG_A),
        () => this.opADC__rr_rr(REG_A, REG_B),
        () => this.opADC__rr_rr(REG_A, REG_C),
        () => this.opADC__rr_rr(REG_A, REG_D),
        () => this.opADC__rr_rr(REG_A, REG_E),
        () => this.opADC__rr_rr(REG_A, REG_H),
        () => this.opADC__rr_rr(REG_A, REG_L),
        () => this.opADC__rr_n$dr(REG_A, REG_HL),
        () => this.opADC__rr_rr(REG_A, REG_A),

        // 0x90
        () => this.opSUB__rr_rr(REG_A, REG_B),
        () => this.opSUB__rr_rr(REG_A, REG_C),
        () => this.opSUB__rr_rr(REG_A, REG_D),
        () => this.opSUB__rr_rr(REG_A, REG_E),
        () => this.opSUB__rr_rr(REG_A, REG_H),
        () => this.opSUB__rr_rr(REG_A, REG_L),
        () => this.opSUB__rr_n$dr(REG_A, REG_HL),
        () => this.opSUB__rr_rr(REG_A, REG_A),
        () => this.opSBC__rr_rr(REG_A, REG_B),
        () => this.opSBC__rr_rr(REG_A, REG_C),
        () => this.opSBC__rr_rr(REG_A, REG_D),
        () => this.opSBC__rr_rr(REG_A, REG_E),
        () => this.opSBC__rr_rr(REG_A, REG_H),
        () => this.opSBC__rr_rr(REG_A, REG_L),
        () => this.opSBC__rr_n$dr(REG_A, REG_HL),
        () => this.opSBC__rr_rr(REG_A, REG_A),

        // 0xA0
        () => this.opAND__rr(REG_B),
        () => this.opAND__rr(REG_C),
        () => this.opAND__rr(REG_D),
        () => this.opAND__rr(REG_E),
        () => this.opAND__rr(REG_H),
        () => this.opAND__rr(REG_L),
        () => this.opAND__n$dr(REG_HL),
        () => this.opAND__rr(REG_A),
        () => this.opXOR__rr(REG_B),
        () => this.opXOR__rr(REG_C),
        () => this.opXOR__rr(REG_D),
        () => this.opXOR__rr(REG_E),
        () => this.opXOR__rr(REG_H),
        () => this.opXOR__rr(REG_L),
        () => this.opXOR__n$dr(REG_HL),
        () => this.opXOR__rr(REG_A),

        // 0xB0
        () => this.opOR__rr(REG_B),
        () => this.opOR__rr(REG_C),
        () => this.opOR__rr(REG_D),
        () => this.opOR__rr(REG_E),
        () => this.opOR__rr(REG_H),
        () => this.opOR__rr(REG_L),
        () => this.opOR__n$dr(REG_HL),
        () => this.opOR__rr(REG_A),
        () => this.opCP__rr(REG_B),
        () => this.opCP__rr(REG_C),
        () => this.opCP__rr(REG_D),
        () => this.opCP__rr(REG_E),
        () => this.opCP__rr(REG_H),
        () => this.opCP__rr(REG_L),
        () => this.opCP__n$dr(REG_HL),
        () => this.opCP__rr(REG_A),

        // 0xC0
        () => this.opRET__flag(FLAG_ZERO, 0x00),
        () => this.opPOP__rrrr(REG_B, REG_C),
        () => this.opJP__flag(FLAG_ZERO, 0x00),
        () => this.opJP(),
        () => this.opCALL__flag(FLAG_ZERO, 0x00),
        () => this.opPUSH__rrrr(REG_B, REG_C),
        () => this.opADD(),
        () => this.opRST(0x00),
        () => this.opRET__flag(FLAG_ZERO, FLAG_ZERO),
        () => this.opRET(),
        () => this.opJP__flag(FLAG_ZERO, FLAG_ZERO),
        () => this.opPREFIX(),
        () => this.opCALL__flag(FLAG_ZERO, FLAG_ZERO),
        () => this.opCALL(),
        () => this.opADC(),
        () => this.opRST(0x08),

        // 0xD0
        () => this.opRET__flag(FLAG_CARRY, 0x00),
        () => this.opPOP__rrrr(REG_D, REG_E),
        () => this.opJP__flag(FLAG_CARRY, 0x00),
        () => this.opXX(),
        () => this.opCALL__flag(FLAG_CARRY, 0x00),
        () => this.opPUSH__rrrr(REG_D, REG_E),
        () => this.opSUB(),
        () => this.opRST(0x10),
        () => this.opRET__flag(FLAG_CARRY, FLAG_CARRY),
        () => this.opRETI(),
        () => this.opJP__flag(FLAG_CARRY, FLAG_CARRY),
        () => this.opXX(),
        () => this.opCALL__flag(FLAG_CARRY, FLAG_CARRY),
        () => this.opXX(),
        () => this.opSBC(),
        () => this.opRST(0x18),

        // 0xE0
        () => this.opLDH__n$ion$pc_rr(REG_A),
        () => this.opPOP__rrrr(REG_H, REG_L),
        () => this.opLDH__n$iorr_rr(REG_C, REG_A),
        () => this.opXX(),
        () => this.opXX(),
        () => this.opPUSH__rrrr(REG_H, REG_L),
        () => this.opAND__n$pc(),
        () => this.opRST(0x20),
        () => this.opADD__sp_n$pc(),
        () => this.opJP__nn$dr(REG_HL),
        () => this.opLD__n$nn$pc_rr(REG_A),
        () => this.opXX(),
        () => this.opXX(),
        () => this.opXX(),
        () => this.opXOR__n$pc(),
        () => this.opRST(0x28),

        // 0xF0
        () => this.opLDH__rr_n$ion$pc(REG_A),
        () => this.opPOP__rrrr(REG_A, REG_F),
        () => this.opXX(),
        () => this.opDI(),
        () => this.opXX(),
        () => this.opPUSH__rrrr(REG_A, REG_F),
        () => this.opOR__n$pc(),
        () => this.opRST(0x30),
        () => this.opLD__dr_sp(REG_HL),
        () => this.opLD__sp_dr(REG_HL),
        () => this.opLD__rr_n$nn$pc(REG_A),
        () => this.opEI(),
        () => this.opXX(),
        () => this.opXX(),
        () => this.opCP__n$pc(),
        () => this.opRST(0x38)
    ];

    cbMap = [
        // 0x00
        () => this.opRLC__rr(REG_B),
        () => this.opRLC__rr(REG_C),
        () => this.opRLC__rr(REG_D),
        () => this.opRLC__rr(REG_E),
        () => this.opRLC__rr(REG_H),
        () => this.opRLC__rr(REG_L),
        () => this.opRLC__n$dr(REG_HL),
        () => this.opRLC__rr(REG_A),
        () => this.opRRC__rr(REG_B),
        () => this.opRRC__rr(REG_C),
        () => this.opRRC__rr(REG_D),
        () => this.opRRC__rr(REG_E),
        () => this.opRRC__rr(REG_H),
        () => this.opRRC__rr(REG_L),
        () => this.opRRC__n$dr(REG_HL),
        () => this.opRRC__rr(REG_A),

        // 0x10
        () => this.opRL__rr(REG_B),
        () => this.opRL__rr(REG_C),
        () => this.opRL__rr(REG_D),
        () => this.opRL__rr(REG_E),
        () => this.opRL__rr(REG_H),
        () => this.opRL__rr(REG_L),
        () => this.opRL__n$dr(REG_HL),
        () => this.opRL__rr(REG_A),
        () => this.opRR__rr(REG_B),
        () => this.opRR__rr(REG_C),
        () => this.opRR__rr(REG_D),
        () => this.opRR__rr(REG_E),
        () => this.opRR__rr(REG_H),
        () => this.opRR__rr(REG_L),
        () => this.opRR__n$dr(REG_HL),
        () => this.opRR__rr(REG_A),

        // 0x20
        () => this.opSLA__rr(REG_B),
        () => this.opSLA__rr(REG_C),
        () => this.opSLA__rr(REG_D),
        () => this.opSLA__rr(REG_E),
        () => this.opSLA__rr(REG_H),
        () => this.opSLA__rr(REG_L),
        () => this.opSLA__n$dr(REG_HL),
        () => this.opSLA__rr(REG_A),
        () => this.opSRA__rr(REG_B),
        () => this.opSRA__rr(REG_C),
        () => this.opSRA__rr(REG_D),
        () => this.opSRA__rr(REG_E),
        () => this.opSRA__rr(REG_H),
        () => this.opSRA__rr(REG_L),
        () => this.opSRA__n$dr(REG_HL),
        () => this.opSRA__rr(REG_A),

        // 0x30
        () => this.opSWAP__rr(REG_B),
        () => this.opSWAP__rr(REG_C),
        () => this.opSWAP__rr(REG_D),
        () => this.opSWAP__rr(REG_E),
        () => this.opSWAP__rr(REG_H),
        () => this.opSWAP__rr(REG_L),
        () => this.opSWAP__n$dr(REG_HL),
        () => this.opSWAP__rr(REG_A),
        () => this.opSRL__rr(REG_B),
        () => this.opSRL__rr(REG_C),
        () => this.opSRL__rr(REG_D),
        () => this.opSRL__rr(REG_E),
        () => this.opSRL__rr(REG_H),
        () => this.opSRL__rr(REG_L),
        () => this.opSRL__n$dr(REG_HL),
        () => this.opSRL__rr(REG_A),

        // 0x40
        () => this.opBIT__p_rr(0, REG_B),
        () => this.opBIT__p_rr(0, REG_C),
        () => this.opBIT__p_rr(0, REG_D),
        () => this.opBIT__p_rr(0, REG_E),
        () => this.opBIT__p_rr(0, REG_H),
        () => this.opBIT__p_rr(0, REG_L),
        () => this.opBIT__p_n$dr(0, REG_HL),
        () => this.opBIT__p_rr(0, REG_A),
        () => this.opBIT__p_rr(1, REG_B),
        () => this.opBIT__p_rr(1, REG_C),
        () => this.opBIT__p_rr(1, REG_D),
        () => this.opBIT__p_rr(1, REG_E),
        () => this.opBIT__p_rr(1, REG_H),
        () => this.opBIT__p_rr(1, REG_L),
        () => this.opBIT__p_n$dr(1, REG_HL),
        () => this.opBIT__p_rr(1, REG_A),

        // 0x50
        () => this.opBIT__p_rr(2, REG_B),
        () => this.opBIT__p_rr(2, REG_C),
        () => this.opBIT__p_rr(2, REG_D),
        () => this.opBIT__p_rr(2, REG_E),
        () => this.opBIT__p_rr(2, REG_H),
        () => this.opBIT__p_rr(2, REG_L),
        () => this.opBIT__p_n$dr(2, REG_HL),
        () => this.opBIT__p_rr(2, REG_A),
        () => this.opBIT__p_rr(3, REG_B),
        () => this.opBIT__p_rr(3, REG_C),
        () => this.opBIT__p_rr(3, REG_D),
        () => this.opBIT__p_rr(3, REG_E),
        () => this.opBIT__p_rr(3, REG_H),
        () => this.opBIT__p_rr(3, REG_L),
        () => this.opBIT__p_n$dr(3, REG_HL),
        () => this.opBIT__p_rr(3, REG_A),

        // 0x60
        () => this.opBIT__p_rr(4, REG_B),
        () => this.opBIT__p_rr(4, REG_C),
        () => this.opBIT__p_rr(4, REG_D),
        () => this.opBIT__p_rr(4, REG_E),
        () => this.opBIT__p_rr(4, REG_H),
        () => this.opBIT__p_rr(4, REG_L),
        () => this.opBIT__p_n$dr(4, REG_HL),
        () => this.opBIT__p_rr(4, REG_A),
        () => this.opBIT__p_rr(5, REG_B),
        () => this.opBIT__p_rr(5, REG_C),
        () => this.opBIT__p_rr(5, REG_D),
        () => this.opBIT__p_rr(5, REG_E),
        () => this.opBIT__p_rr(5, REG_H),
        () => this.opBIT__p_rr(5, REG_L),
        () => this.opBIT__p_n$dr(5, REG_HL),
        () => this.opBIT__p_rr(5, REG_A),

        // 0x70
        () => this.opBIT__p_rr(6, REG_B),
        () => this.opBIT__p_rr(6, REG_C),
        () => this.opBIT__p_rr(6, REG_D),
        () => this.opBIT__p_rr(6, REG_E),
        () => this.opBIT__p_rr(6, REG_H),
        () => this.opBIT__p_rr(6, REG_L),
        () => this.opBIT__p_n$dr(6, REG_HL),
        () => this.opBIT__p_rr(6, REG_A),
        () => this.opBIT__p_rr(7, REG_B),
        () => this.opBIT__p_rr(7, REG_C),
        () => this.opBIT__p_rr(7, REG_D),
        () => this.opBIT__p_rr(7, REG_E),
        () => this.opBIT__p_rr(7, REG_H),
        () => this.opBIT__p_rr(7, REG_L),
        () => this.opBIT__p_n$dr(7, REG_HL),
        () => this.opBIT__p_rr(7, REG_A),

        // 0x80
        () => this.opRES__p_rr(0, REG_B),
        () => this.opRES__p_rr(0, REG_C),
        () => this.opRES__p_rr(0, REG_D),
        () => this.opRES__p_rr(0, REG_E),
        () => this.opRES__p_rr(0, REG_H),
        () => this.opRES__p_rr(0, REG_L),
        () => this.opRES__p_n$dr(0, REG_HL),
        () => this.opRES__p_rr(0, REG_A),
        () => this.opRES__p_rr(1, REG_B),
        () => this.opRES__p_rr(1, REG_C),
        () => this.opRES__p_rr(1, REG_D),
        () => this.opRES__p_rr(1, REG_E),
        () => this.opRES__p_rr(1, REG_H),
        () => this.opRES__p_rr(1, REG_L),
        () => this.opRES__p_n$dr(1, REG_HL),
        () => this.opRES__p_rr(1, REG_A),

        // 0x90
        () => this.opRES__p_rr(2, REG_B),
        () => this.opRES__p_rr(2, REG_C),
        () => this.opRES__p_rr(2, REG_D),
        () => this.opRES__p_rr(2, REG_E),
        () => this.opRES__p_rr(2, REG_H),
        () => this.opRES__p_rr(2, REG_L),
        () => this.opRES__p_n$dr(2, REG_HL),
        () => this.opRES__p_rr(2, REG_A),
        () => this.opRES__p_rr(3, REG_B),
        () => this.opRES__p_rr(3, REG_C),
        () => this.opRES__p_rr(3, REG_D),
        () => this.opRES__p_rr(3, REG_E),
        () => this.opRES__p_rr(3, REG_H),
        () => this.opRES__p_rr(3, REG_L),
        () => this.opRES__p_n$dr(3, REG_HL),
        () => this.opRES__p_rr(3, REG_A),

        // 0xA0
        () => this.opRES__p_rr(4, REG_B),
        () => this.opRES__p_rr(4, REG_C),
        () => this.opRES__p_rr(4, REG_D),
        () => this.opRES__p_rr(4, REG_E),
        () => this.opRES__p_rr(4, REG_H),
        () => this.opRES__p_rr(4, REG_L),
        () => this.opRES__p_n$dr(4, REG_HL),
        () => this.opRES__p_rr(4, REG_A),
        () => this.opRES__p_rr(5, REG_B),
        () => this.opRES__p_rr(5, REG_C),
        () => this.opRES__p_rr(5, REG_D),
        () => this.opRES__p_rr(5, REG_E),
        () => this.opRES__p_rr(5, REG_H),
        () => this.opRES__p_rr(5, REG_L),
        () => this.opRES__p_n$dr(5, REG_HL),
        () => this.opRES__p_rr(5, REG_A),

        // 0xB0
        () => this.opRES__p_rr(6, REG_B),
        () => this.opRES__p_rr(6, REG_C),
        () => this.opRES__p_rr(6, REG_D),
        () => this.opRES__p_rr(6, REG_E),
        () => this.opRES__p_rr(6, REG_H),
        () => this.opRES__p_rr(6, REG_L),
        () => this.opRES__p_n$dr(6, REG_HL),
        () => this.opRES__p_rr(6, REG_A),
        () => this.opRES__p_rr(7, REG_B),
        () => this.opRES__p_rr(7, REG_C),
        () => this.opRES__p_rr(7, REG_D),
        () => this.opRES__p_rr(7, REG_E),
        () => this.opRES__p_rr(7, REG_H),
        () => this.opRES__p_rr(7, REG_L),
        () => this.opRES__p_n$dr(7, REG_HL),
        () => this.opRES__p_rr(7, REG_A),

        // 0xC0
        () => this.opSET__p_rr(0, REG_B),
        () => this.opSET__p_rr(0, REG_C),
        () => this.opSET__p_rr(0, REG_D),
        () => this.opSET__p_rr(0, REG_E),
        () => this.opSET__p_rr(0, REG_H),
        () => this.opSET__p_rr(0, REG_L),
        () => this.opSET__p_n$dr(0, REG_HL),
        () => this.opSET__p_rr(0, REG_A),
        () => this.opSET__p_rr(1, REG_B),
        () => this.opSET__p_rr(1, REG_C),
        () => this.opSET__p_rr(1, REG_D),
        () => this.opSET__p_rr(1, REG_E),
        () => this.opSET__p_rr(1, REG_H),
        () => this.opSET__p_rr(1, REG_L),
        () => this.opSET__p_n$dr(1, REG_HL),
        () => this.opSET__p_rr(1, REG_A),

        // 0xD0
        () => this.opSET__p_rr(2, REG_B),
        () => this.opSET__p_rr(2, REG_C),
        () => this.opSET__p_rr(2, REG_D),
        () => this.opSET__p_rr(2, REG_E),
        () => this.opSET__p_rr(2, REG_H),
        () => this.opSET__p_rr(2, REG_L),
        () => this.opSET__p_n$dr(2, REG_HL),
        () => this.opSET__p_rr(2, REG_A),
        () => this.opSET__p_rr(3, REG_B),
        () => this.opSET__p_rr(3, REG_C),
        () => this.opSET__p_rr(3, REG_D),
        () => this.opSET__p_rr(3, REG_E),
        () => this.opSET__p_rr(3, REG_H),
        () => this.opSET__p_rr(3, REG_L),
        () => this.opSET__p_n$dr(3, REG_HL),
        () => this.opSET__p_rr(3, REG_A),

        // 0xE0
        () => this.opSET__p_rr(4, REG_B),
        () => this.opSET__p_rr(4, REG_C),
        () => this.opSET__p_rr(4, REG_D),
        () => this.opSET__p_rr(4, REG_E),
        () => this.opSET__p_rr(4, REG_H),
        () => this.opSET__p_rr(4, REG_L),
        () => this.opSET__p_n$dr(4, REG_HL),
        () => this.opSET__p_rr(4, REG_A),
        () => this.opSET__p_rr(5, REG_B),
        () => this.opSET__p_rr(5, REG_C),
        () => this.opSET__p_rr(5, REG_D),
        () => this.opSET__p_rr(5, REG_E),
        () => this.opSET__p_rr(5, REG_H),
        () => this.opSET__p_rr(5, REG_L),
        () => this.opSET__p_n$dr(5, REG_HL),
        () => this.opSET__p_rr(5, REG_A),

        // 0xF0
        () => this.opSET__p_rr(6, REG_B),
        () => this.opSET__p_rr(6, REG_C),
        () => this.opSET__p_rr(6, REG_D),
        () => this.opSET__p_rr(6, REG_E),
        () => this.opSET__p_rr(6, REG_H),
        () => this.opSET__p_rr(6, REG_L),
        () => this.opSET__p_n$dr(6, REG_HL),
        () => this.opSET__p_rr(6, REG_A),
        () => this.opSET__p_rr(7, REG_B),
        () => this.opSET__p_rr(7, REG_C),
        () => this.opSET__p_rr(7, REG_D),
        () => this.opSET__p_rr(7, REG_E),
        () => this.opSET__p_rr(7, REG_H),
        () => this.opSET__p_rr(7, REG_L),
        () => this.opSET__p_n$dr(7, REG_HL),
        () => this.opSET__p_rr(7, REG_A)
    ];

    constructor(gb){
        this.gb = gb;
        this.memory = gb.mmu;
        this.doubleRegisters.cpu = this;
        this.log = this.gb.createLogger('gb:cpu');
    }

    step(){
        this.r = (this.r + 1) & 127;
        this.clock.m += this.opMap[this.memory.readByte(this.programCounter++)]();
        this.programCounter &= 65535;
    }

    reset(){
        this.registers.fill(0);
        this.rRegisters.fill(0);
        this.stackPointer = 0;
        this.programCounter = 0;
        this.clock.m = 0;
        this.clock.t = 0;
        this.halt = 0;
        this.r = 0;

        this.log('reset');
    }

    getWordReg(regHi, regLo){
        return (this.registers[regHi] << 8) + this.registers[regLo];
    }

    setWordReg(regHi, regLo, val){
        this.registers[regHi] = (val >> 8) & 255;
        this.registers[regLo] = val & 255;
    }

    opLD__rr_rr(regA, regB){
        this.registers[regA] = this.registers[regB];
        return 1;
    }

    opXX(){
        this.log('ERROR: unimplemented instruction 0x' + this.memory.readByte(this.programCounter - 1).toString(16) + ', pausing');
        this.gb.stop();
        return 0;
    }

    opNOP(){
        return 1;
    }

    opHALT(){
        this.halt = 1;
        return 1;
    }

    // load word from memory@programCounter into given double register
    opLD__dr_nn$pc(reg){
        this.doubleRegisters[reg] = this.memory.readWord(this.programCounter);
        this.programCounter += 2;
        return 3;
    }

    // load byte from memory@programCounter into given register
    opLD__rr_n$pc(reg){
        this.registers[reg] = this.memory.readByte(this.programCounter);
        this.programCounter += 1;
        return 2;
    }

    // load byte from memory@doubleRegister into given register
    opLD__rr_n$dr(valueRegister, addressDoubleRegister){
        this.registers[valueRegister] = this.memory.readByte(this.doubleRegisters[addressDoubleRegister]);
        return 2;
    }

    // write word from given doubleRegister to memory@doubleRegister
    opLD__nn$dr_dr(addressDoubleRegister, valueDoubleRegister){
        this.memory.writeWord(this.doubleRegisters[addressDoubleRegister], this.doubleRegisters[valueDoubleRegister]);
        return 5;
    }

    // write byte from given register to memory@doubleRegister
    opLD__n$dr_rr(addressDoubleRegister, valueRegister){
        this.memory.writeByte(this.doubleRegisters[addressDoubleRegister], this.registers[valueRegister]);
        return 2;
    }

    // save double register in memory@intermediateValue
    opLD__nn$nn$pc_dr(reg){
        let addr = this.memory.readWord(this.programCounter);
        this.memory.writeWord(addr, this.doubleRegisters[reg]);
        this.programCounter += 2;
        return 5;
    }

    // write byte from given register to memory@doubleRegister++
    opLDI__n$dr_rr(addressDoubleRegister, valueRegister){
        this.opLD__n$dr_rr(addressDoubleRegister, valueRegister);
        this.opINC__dr(addressDoubleRegister);
        return 2;
    }

    // load byte from memory@doubleRegister++ into given register
    opLDI__rr_n$dr(valueRegister, addressDoubleRegister){
        this.opLD__rr_n$dr(valueRegister, addressDoubleRegister);
        this.opINC__dr(addressDoubleRegister);
        return 2;
    }

    // write byte from given register to memory@doubleRegister--
    opLDD__n$dr_rr(addressDoubleRegister, valueRegister){
        this.opLD__n$dr_rr(addressDoubleRegister, valueRegister);
        this.opDEC__dr(addressDoubleRegister);
        return 2;
    }

    opLDD__rr_n$dr(valueRegister, addressDoubleRegister){
        this.opLD__rr_n$dr(valueRegister, addressDoubleRegister);
        this.opDEC__dr(addressDoubleRegister);
        return 2;
    }

    // write byte from immediate value to memory@doubleRegister
    opLD__n$dr_n$pc(addressDoubleRegister){
        this.memory.writeByte(this.doubleRegisters[addressDoubleRegister], this.memory.readByte(this.programCounter++));
        return 3;
    }

    // write byte from given register to memory@io+immediate
    opLDH__n$ion$pc_rr(reg){
        this.memory.writeByte(0xFF00 + this.memory.readByte(this.programCounter), this.registers[reg]);
        this.programCounter++;
        return 3;
    }

    opLD__dr_sp(reg){
        let i = this.memory.readByte(this.programCounter);
        if(i > 127){
            i = -((~i + 1) & 255);
        }
        this.programCounter++;
        i += this.stackPointer;
        this.doubleRegisters[reg] = i;
        return 3;
    }

    // load word to stackPointer from doubleRegister
    opLD__sp_dr(reg){
        this.stackPointer = this.doubleRegisters[reg];
        return 1;
    }

    // load byte from memory@io+immediate to given register
    opLDH__rr_n$ion$pc(reg){
        this.registers[reg] = this.memory.readByte(0xFF00 + this.memory.readByte(this.programCounter));
        this.programCounter++;
        return 3;
    }

    // write byte to memory@io+sourceReg from given register
    opLDH__n$iorr_rr(sourceReg, valReg){
        this.memory.writeByte(0xFF00 + this.registers[sourceReg], this.registers[valReg]);
        return 2;
    }

    // write byte to memory@programCounter from given register
    opLD__n$nn$pc_rr(reg){
        this.memory.writeByte(this.memory.readWord(this.programCounter), this.registers[reg]);
        this.programCounter += 2;
        return 2;
    }

    // load byte from memory@immediate to given register
    opLD__rr_n$nn$pc(reg){
        this.registers[reg] = this.memory.readByte(this.memory.readWord(this.programCounter));
        this.programCounter += 2;
        return 4;
    }

    // increase double register
    opINC__dr(reg){
        this.doubleRegisters[reg]++;
        return 1;
    }

    // increase single register
    opINC__rr(reg){
        this.registers[reg] = this.registers[reg] + 1;
        this.registers[REG_F] = this.registers[reg] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    // increase byte in memory@doubleRegister
    opINC__n$dr(doubleRegister){
        let i = this.memory.readByte(this.doubleRegisters[doubleRegister]) + 1;
        i &= 255;
        this.memory.writeByte(this.doubleRegisters[doubleRegister], i);
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        return 3;
    }

    // decrease byte in memory@doubleRegister
    opDEC__n$dr(doubleRegister){
        let i = this.memory.readByte(this.doubleRegisters[doubleRegister]) - 1;
        i &= 255;
        this.memory.writeByte(this.doubleRegisters[doubleRegister], i);
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        return 3;
    }

    // decrease double register
    opDEC__dr(reg){
        this.doubleRegisters[reg]--;
        return 1;
    }

    // decrease single register
    opDEC__rr(reg){
        this.registers[reg] = this.registers[reg] - 1;
        this.registers[REG_F] = this.registers[reg] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    opADD(){
        let a = this.registers[REG_A];
        let m = this.memory.readByte(this.programCounter);
        let valueReg = a + m;
        this.programCounter++;
        this.registers[REG_F] = (valueReg > 255) ? 0x10 : 0;
        this.registers[REG_A] = valueReg;
        if(this.registers[REG_A] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ a ^ m) & 0x10){
            this.registers[REG_F] |= FLAG_CARRY;
        }
        return 2;
    }

    // double register + double register
    opADD__dr_dr(regA, regB){
        let hl = this.doubleRegisters[regA];
        hl += this.doubleRegisters[regB];
        if(hl > 65535){
            this.registers[REG_F] |= FLAG_CARRY;
        } else {
            this.registers[REG_F] = 0xEF;
        }
        this.doubleRegisters[regA] = hl;
        return 3;
    }

    // register + register
    // @TODO simplify this?
    opADD__rr_rr(regA, regB){
        let a = this.registers[regA];
        let valueReg = a + this.registers[regB];
        this.registers[REG_F] = (valueReg > 255) ? FLAG_CARRY : 0;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ this.registers[regB] ^ a) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 1;
    }

    // register + memory@doubleRegister
    opADD__rr_n$dr(regA, regB){
        let a = this.registers[regA];
        let m = this.memory.readByte(this.doubleRegisters[regB]);
        let valueReg = a + m;
        this.registers[REG_F] = (valueReg > 255) ? 0x10 : 0;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ a ^ m) & 0x10){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 2;
    }

    opADD__sp_n$pc(){
        let i = this.memory.readByte(this.programCounter);
        if(i > 127){
            i = -((~i + 1) & 255);
        }
        this.programCounter++;
        this.stackPointer += i;
        return 4;
    }

    // register + memory@programCounter
    opADC(){
        let a = this.registers[REG_A];
        let m = this.memory.readByte(this.programCounter);
        let valueReg = a + m;
        this.programCounter++;
        valueReg += (this.registers[REG_F] & 0x10) ? 1 : 0;
        this.registers[REG_F] = (valueReg > 255) ? 0x10 : 0;
        this.registers[REG_A] = valueReg;
        if(this.registers[REG_A] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ m ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_CARRY;
        }
        return 2;
    }

    // register + register + FLAG_CARRY
    opADC__rr_rr(regA, regB){
        let a = this.registers[regA];
        let valueReg = a + this.registers[regB];
        valueReg += (this.registers[REG_F] & FLAG_CARRY) ? 1 : 0;
        this.registers[REG_F] = (valueReg > 255) ? FLAG_CARRY : 0;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[regA] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ this.registers[regB] ^ a) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 1;
    }

    // register + memory@doubleRegister + FLAG_CARRY
    opADC__rr_n$dr(regA, regB){
        let a = this.registers[regA];
        let m = this.memory.readByte(this.registers[regB]);
        let valueReg = a + m;
        valueReg += (this.registers[REG_F] & FLAG_CARRY) ? 1 : 0;
        this.registers[REG_F] = (valueReg > 255) ? FLAG_CARRY : 0;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[regA] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ m ^ a) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 2;
    }

    // register - memory@programCounter - FLAG_CARRY
    opSUB(){
        let a = this.registers[REG_A];
        let m = this.memory.readByte(this.programCounter);
        let valueReg = a - m;
        this.programCounter++;
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[REG_A] = valueReg;
        if(this.registers[REG_A] === 0){
            this.registers[REG_F] = FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ m ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_CARRY;
        }
        return 2;
    }

    // register - register
    opSUB__rr_rr(regA, regB){
        let a = this.registers[regA];
        let valueReg = a - this.registers[regB];
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ this.registers[regB] ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 1;
    }

    // register - memory@doubleRegister
    opSUB__rr_n$dr(regA, regB){
        let a = this.registers[regA];
        let m = this.memory.readByte(this.doubleRegisters[regB]);
        let valueReg = a - m;
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] = FLAG_ZERO;
        }
        if((this.registers[regA] ^ m ^ a) & 0x10){
            this.registers[REG_F] = FLAG_HALF_CARRY;
        }
        return 2;
    }

    // register - memory@programCounter - FLAG_CARRY
    opSBC(){
        let a = this.registers[REG_A];
        let m = this.memory.readByte(this.programCounter);
        let valueReg = a - m;
        this.programCounter++;
        valueReg -= (this.registers[REG_F] & 0x10) ? 1 : 0;
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[REG_A] = valueReg;
        if(this.registers[REG_A] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ m ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_HALF_CARRY
        }
        return 2;
    }

    // register - register - FLAG_CARRY
    opSBC__rr_rr(regA, regB){
        let a = this.registers[regA];
        let valueReg = a - this.registers[regB];
        valueReg -= (this.registers[REG_F] & FLAG_CARRY) ? 1 : 0;
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ this.registers[regB] ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_HALF_CARRY
        }
        return 1;
    }

    // register - memory@doubleRegister - FLAG_CARRY
    opSBC__rr_n$dr(regA, regB){
        let a = this.registers[regA];
        let m = this.memory.readByte(this.doubleRegisters[regB]);

        let valueReg = a - m;
        valueReg -= (this.registers[REG_F] & FLAG_CARRY) ? 1 : 0;
        this.registers[REG_F] = (valueReg < 0) ? 0x50 : 0x40;
        this.registers[regA] = valueReg;
        if(this.registers[regA] === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[regA] ^ m ^ a) & 0x10){
            this.registers[REG_F] |= FLAG_HALF_CARRY
        }
        return 2;
    }

    // reg a &= reg
    opAND__rr(reg){
        this.registers[REG_A] &= this.registers[reg];
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    // reg a &= memory@doubleRegister
    opAND__n$dr(reg){
        this.registers[REG_A] &= this.memory.readByte(this.doubleRegisters[reg]);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 2;
    }

    // reg a &= memory@programCounter++
    opAND__n$pc(){
        this.registers[REG_A] &= this.memory.readByte(this.programCounter++);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 2;
    }

    // reg a |= reg
    opOR__rr(reg){
        this.registers[REG_A] |= this.registers[reg];
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    // reg a |= memory@doubleRegister
    opOR__n$dr(reg){
        this.registers[REG_A] |= this.memory.readByte(this.doubleRegisters[reg]);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 2;
    }

    // reg a |= memory@programCounter++
    opOR__n$pc(){
        this.registers[REG_A] |= this.memory.readByte(this.programCounter++);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 2;
    }

    // reg a ^= reg
    opXOR__rr(reg){
        this.registers[REG_A] ^= this.registers[reg];
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    // reg a ^= memory@doubleRegister
    opXOR__n$dr(reg){
        this.registers[REG_A] ^= this.memory.readByte(this.doubleRegisters[reg]);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 1;
    }

    // reg a ^= memory@programCounter++
    opXOR__n$pc(){
        this.registers[REG_A] ^= this.memory.readByte(this.programCounter++);
        this.registers[REG_F] = this.registers[REG_A] === 0 ? FLAG_ZERO : 0;
        return 2;
    }

    opCP__rr(reg){
        let i = this.registers[REG_A];
        i -= this.registers[reg];
        this.registers[REG_F] = (i < 0) ? 0x50 : 0x40;
        i &= 255;
        if(i === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ this.registers[reg] ^ i) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 1;
    }

    opCP__n$dr(reg){
        let i = this.registers[REG_A];
        let m = this.memory.readByte(reg);
        i -= m;
        this.registers[REG_F] = (i < 0) ? 0x50 : 0x40;
        i &= 255;
        if(i === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ m ^ i) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 2;
    }

    opCP__n$pc(){
        let i = this.registers[REG_A];
        let m = this.memory.readByte(this.programCounter);
        i -= m;
        this.programCounter++;
        this.registers[REG_F] = (i < 0) ? 0x50 : 0x40;
        i &= 255;
        if(i === 0){
            this.registers[REG_F] |= FLAG_ZERO;
        }
        if((this.registers[REG_A] ^ m ^ i) & FLAG_CARRY){
            this.registers[REG_F] |= FLAG_HALF_CARRY;
        }
        return 2;
    }

    // pop word from stack (uses hi/lo instead of doubleRegisters)
    opPOP__rrrr(regHi, regLo){
        this.registers[regLo] = this.memory.readByte(this.stackPointer);
        this.stackPointer++;
        this.registers[regHi] = this.memory.readByte(this.stackPointer);
        this.stackPointer++;
        return 3;
    }

    opPUSH__rrrr(regHi, regLo){
        this.stackPointer--;
        this.memory.writeByte(this.stackPointer, this.registers[regHi]);
        this.stackPointer--;
        this.memory.writeByte(this.stackPointer, this.registers[regLo]);
        return 3;
    }


    // rotate reg a left
    opRL__a(){
        let ci = this.registers[REG_F] & FLAG_CARRY ? 1 : 0;
        let co = this.registers[REG_A] & FLAG_ZERO ? FLAG_CARRY : 0;
        this.registers[REG_A] = (this.registers[REG_A] << 1) + ci;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 1;
    }

    // rotate reg left and check for zero
    opRL__rr(reg){
        let ci = this.registers[REG_F] & FLAG_CARRY ? 1 : 0;
        let co = this.registers[reg] & FLAG_ZERO ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] << 1) + ci;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    opRL__n$dr(reg){
        let i = this.memory.readByte(this.doubleRegisters[REG_HL]);
        let ci = this.registers[REG_F] & FLAG_CARRY ? 1 : 0;
        let co = i & FLAG_ZERO ? FLAG_CARRY : 0;
        i = (i << 1) + ci;
        i &= 255;
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        this.memory.writeByte(this.doubleRegisters[REG_HL], i);
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 4;
    }

    // rotate reg a left with carry
    opRLC__a(){
        let ci = this.registers[REG_A] & FLAG_ZERO ? 1 : 0;
        let co = this.registers[REG_A] & FLAG_ZERO ? FLAG_CARRY : 0;
        this.registers[REG_A] = (this.registers[REG_A] << 1) + ci;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 1;
    }

    // rotate reg left with carry and zero
    opRLC__rr(reg){
        let ci = this.registers[reg] & FLAG_ZERO ? 1 : 0;
        let co = this.registers[reg] & FLAG_ZERO ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] << 1) + ci;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    // rotate doubleRegister left with carry
    opRLC__n$dr(reg){
        let i = this.memory.readByte(this.doubleRegisters[reg]);
        let ci = i & FLAG_ZERO ? 1 : 0;
        let co = i & FLAG_ZERO ? FLAG_CARRY : 0;
        i = (i << 1) + ci;
        i &= 255;
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        this.memory.writeByte(this.doubleRegisters[reg], i);
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 4;
    }

    // rotate reg a right
    opRR__a(){
        let ci = this.registers[REG_F] & FLAG_CARRY ? FLAG_ZERO : 0;
        let co = this.registers[REG_A] & 1 ? FLAG_CARRY : 0;
        this.registers[REG_A] = (this.registers[REG_A] >> 1) + ci;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 1;
    }

    // rotate reg right and check for zero
    opRR__rr(reg){
        let ci = this.registers[REG_F] & FLAG_CARRY ? FLAG_ZERO : 0;
        let co = this.registers[reg] & 1 ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] >> 1) + ci;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 1;
    }

    opRR__n$dr(reg){
        let i = this.memory.readByte(this.doubleRegisters[reg]);
        let ci = i & FLAG_ZERO ? 1 : 0;
        let co = i & FLAG_ZERO ? FLAG_CARRY : 0;
        i = (i << 1) + ci;
        i &= 255;
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        this.memory.writeByte(this.doubleRegisters[reg], i);
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 4;
    }

    // rotate reg a right with carry
    opRRC__a(){
        let ci = this.registers[REG_A] & 1 ? FLAG_ZERO : 0;
        let co = this.registers[REG_A] & 1 ? FLAG_CARRY : 0;
        this.registers[REG_A] = (this.registers[REG_A] >> 1) + ci;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 1;
    }

    // rotate reg right with carry and check for zero
    opRRC__rr(reg){
        let ci = this.registers[reg] & 1 ? FLAG_ZERO : 0;
        let co = this.registers[reg] & 1 ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] >> 1) + ci;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    // rotate doubleRegister right with carry
    opRRC__n$dr(reg){
        let i = this.memory.readByte(this.doubleRegisters[reg]);
        let ci = i & 1 ? FLAG_ZERO : 0;
        let co = i & 1 ? FLAG_CARRY : 0;
        i = (i >> 1) + ci;
        i &= 255;
        this.memory.writeByte(this.doubleRegisters[reg], i);
        this.registers[REG_F] = i ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 4;
    }

    // shift reg left preserving sign
    opSLA__rr(reg){
        let co = this.registers[reg] & FLAG_ZERO ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] << 1) & 255;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    // shift memory@doubleRegister left preserving sign
    opSLA__n$dr(reg){
        let m = this.memory.readByte(this.doubleRegisters[reg]);
        let co = m & FLAG_ZERO ? FLAG_CARRY : 0;
        this.memory.writeByte(this.doubleRegisters[reg], (m << 1) & 255);
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 3;
    }

    // shift reg right preserving sign
    opSRA__rr(reg){
        let ci = this.registers[reg] & FLAG_ZERO;
        let co = this.registers[reg] & 1 ? FLAG_CARRY : 0;
        this.registers[reg] = ((this.registers[reg] >> 1) + ci) & 255;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    // shift memory@doubleRegister right preserving sign
    opSRA__n$dr(reg){
        let m = this.memory.readByte(this.doubleRegisters[reg]);
        let ci = m & FLAG_ZERO;
        let co = m & 1 ? FLAG_CARRY : 0;
        m = ((m >> 1) + ci) & 255;
        this.memory.writeByte(this.doubleRegisters[reg], m);
        this.registers[REG_F] = m ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 3;
    }

    // shift reg right
    opSRL__rr(reg){
        let co = this.registers[reg] & 1 ? FLAG_CARRY : 0;
        this.registers[reg] = (this.registers[reg] >> 1) & 255;
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 2;
    }

    // shift memory@doubleRegister right
    opSRL__n$dr(reg){
        let m = this.memory.readByte(this.doubleRegisters[reg]);
        let co = m & 1 ? FLAG_CARRY : 0;
        m = (m >> 1) & 255;
        this.memory.writeByte(this.doubleRegisters[reg], m);
        this.registers[REG_F] = m ? 0 : FLAG_ZERO;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + co;
        return 3;
    }

    // swap nybbles in reg
    opSWAP__rr(reg){
        let tr = this.registers[reg];
        this.registers[reg] = ((tr & 0xF) << 4) | ((tr & 0xF0) >> 4);
        this.registers[REG_F] = this.registers[reg] ? 0 : FLAG_ZERO;
        return 1;
    }

    // swap nybbles in memory@doubleRegister
    opSWAP__n$dr(reg){
        let tr = this.memory.readByte(this.doubleRegisters[reg]);
        tr = ((tr & 0xF) << 4) | ((tr & 0xF0) >> 4);
        this.memory.writeByte(this.doubleRegisters[reg], tr);
        this.registers[REG_F] = tr ? 0 : FLAG_ZERO;
        return 2;
    }

    // test bit p of register reg
    opBIT__p_rr(pos, reg){
        pos = this.positionBits[pos];
        this.registers[REG_F] &= 0x1F;
        this.registers[REG_F] |= 0x20;
        this.registers[REG_F] = (this.registers[reg] & pos) ? 0 : FLAG_ZERO;
        return 2;
    }

    // test bit p of memory@doubleRegister
    opBIT__p_n$dr(pos, reg){
        pos = this.positionBits[pos];
        this.registers[REG_F] &= 0x1F;
        this.registers[REG_F] |= 0x20;
        this.registers[REG_F] = (this.memory.readByte(this.doubleRegisters[reg]) & pos) ? 0 : FLAG_ZERO;
        return 3;
    }

    // reset bit p of register reg
    opRES__p_rr(pos, reg){
        pos = this.invertedPositionBits[pos];
        this.registers[reg] &= pos;
        return 2;
    }

    // reset bit p of memory@doubleRegister
    opRES__p_n$dr(pos, reg){
        pos = this.invertedPositionBits[pos];
        let i = this.memory.readByte(this.doubleRegisters[reg]);
        i &= pos;
        this.memory.writeByte(this.doubleRegisters[reg], i);
        return 4;
    }

    // set bit p of register reg
    opSET__p_rr(pos, reg){
        pos = this.positionBits[pos];
        this.registers[reg] |= pos;
        return 2;
    }

    // set bit p of memory@doubleRegister
    opSET__p_n$dr(pos, reg){
        pos = this.positionBits[pos];
        let i = this.memory.readByte(this.doubleRegisters[reg]);
        i |= pos;
        this.memory.writeByte(this.doubleRegisters[reg], i);
        return 4;
    }

    // relative jump by immediate value
    opJR(){
        let i = this.memory.readByte(this.programCounter);
        if(i > 127){
            i = -((~i + 1) & 255);
        }
        this.programCounter++;
        let clock = 2;
        this.programCounter += i;
        clock++;
        return clock;
    }

    // relative conditional jump if flag matches test
    opJR__flag(flag, test){
        let i = this.memory.readByte(this.programCounter);
        if(i > 127){
            i = ((~i + 1) & 255);
        }
        this.programCounter++;
        let clock = 2;
        if((this.registers[REG_F] & flag) === test){
            this.programCounter += i;
            clock++;
        }
        return clock;
    }

    // absolute jump by immediate double
    opJP(){
        this.programCounter = this.memory.readWord(this.programCounter);
        return 3;
    }

    opJP__nn$dr(reg){
        this.programCounter = this.doubleRegisters[reg];
        return 1;
    }

    // conditional absolute jump if flag matches test
    opJP__flag(flag, test){
        let clock = 3;
        if((this.registers[REG_F] & flag) === test){
            this.programCounter = this.memory.readWord(this.programCounter);
            clock++;
        } else {
            this.programCounter += 2;
        }
        return clock;
    }

    opCALL(){
        this.stackPointer -= 2;
        this.memory.writeWord(this.stackPointer, this.programCounter + 2);
        this.programCounter = this.memory.readWord(this.programCounter);
        return 5;
    }

    opCALL__flag(flag, test){
        let clock = 3;
        if((this.registers[REG_F] & flag) === test){
            this.stackPointer -= 2;
            this.memory.writeWord(this.stackPointer, this.programCounter + 2);
            this.programCounter = this.memory.readWord(this.programCounter);
            clock += 2;
        } else {
            this.programCounter += 2;
        }
        return clock;
    }

    // return to calling routine
    opRET(){
        this.programCounter = this.memory.readByte(this.stackPointer);
        this.stackPointer += 2;
        return 3;
    }

    // conditional return if flag matches test
    opRET__flag(flag, test){
        let clock = 1;
        if((this.registers[REG_F] & flag) === test){
            this.programCounter = this.memory.readWord(this.stackPointer);
            this.stackPointer += 2;
            clock += 2;
        }
        return clock;
    }

    opRETI(){
        this.interruptsEnabled = 1;
        this.registersRestore();
        this.programCounter = this.memory.readWord(this.stackPointer);
        this.stackPointer += 2;
        return 3;
    }

    // adjust register a for bcd addition
    opDAA(){
        let a = this.registers[REG_A];
        if(this.registers[REG_F] & 0x20 || (this.registers[REG_A] & 15) > 9){
            this.registers[REG_A] += 6;
        }
        this.registers[REG_F] &= 0xEF;
        if(this.registers[REG_F] & 0x20 || a > 0x99){
            this.registers[REG_A] += 0x60;
            this.registers[REG_F] |= 0x10;
        }
        return 1;
    }

    // negate register a
    opCPL(){
        this.registers[REG_A] ^= 255;
        this.registers[REG_F] = this.registers[REG_A] === 0 ? 0x80 : 0;
        return 1;
    }

    // set carry flag
    opSCF(){
        this.registers[REG_F] |= FLAG_CARRY;
        return 1;
    }

    // clear carry flag
    opCCF(){
        let ci = this.registers[REG_F] & 0x10 ? 0 : 0x10;
        this.registers[REG_F] = (this.registers[REG_F] & 0xEF) + ci;
        return 1;
    }

    // call routine at given address
    opRST(address){
        this.registersSave();
        this.stackPointer -= 2;
        this.memory.writeWord(this.stackPointer, this.programCounter);
        this.programCounter = address;
        return 3;
    }

    // use extended opset
    opPREFIX(){
        let i = this.memory.readByte(this.programCounter);
        this.programCounter++;
        this.programCounter &= 65535;
        if(this.cbMap[i]){
            return this.cbMap[i]();
        } else {
            this.log('ERROR: extended opcode $PREFIX_' + (i ? i.toString(16) : '0x??') + ' not implemented');
            return 0;
        }
    }

    // enable interrupts
    opEI(){
        this.interruptsEnabled = 1;
        return 1;
    }

    // disable interrupts
    opDI(){
        this.interruptsEnabled = 0;
        return 1;
    }

    opDJNZ__n$pc(){
        let i = this.memory.readByte(this.programCounter);
        if(i > 127){
            i = -((~i + 1) & 255);
        }
        this.programCounter++;
        let clock = 2;
        this.registers[REG_B]--;
        if(this.registers[REG_B]){
            this.programCounter += i;
            clock++;
        }
        return clock;
    }

    // save registers to temp
    registersSave(){
        this.rRegisters.set(this.registers);
    }

    // restore registers from temp
    registersRestore(){
        this.registers.set(this.rRegisters);
    }
}

const ROM_ONLY = 0x00;
const ROM_MBC1 = 0x01;

const BIOS_GB_1 = Uint8Array.of(
    0x31, 0xFE, 0xFF, 0xAF, 0x21, 0xFF, 0x9F, 0x32,  0xCB, 0x7C, 0x20, 0xFB, 0x21, 0x26, 0xFF, 0x0E,
    0x11, 0x3E, 0x80, 0x32, 0xE2, 0x0C, 0x3E, 0xF3,  0xE2, 0x32, 0x3E, 0x77, 0x77, 0x3E, 0xFC, 0xE0,
    0x47, 0x11, 0x04, 0x01, 0x21, 0x10, 0x80, 0x1A,  0xCD, 0x95, 0x00, 0xCD, 0x96, 0x00, 0x13, 0x7B,
    0xFE, 0x34, 0x20, 0xF3, 0x11, 0xD8, 0x00, 0x06,  0x08, 0x1A, 0x13, 0x22, 0x23, 0x05, 0x20, 0xF9,
    0x3E, 0x19, 0xEA, 0x10, 0x99, 0x21, 0x2F, 0x99,  0x0E, 0x0C, 0x3D, 0x28, 0x08, 0x32, 0x0D, 0x20,
    0xF9, 0x2E, 0x0F, 0x18, 0xF3, 0x67, 0x3E, 0x64,  0x57, 0xE0, 0x42, 0x3E, 0x91, 0xE0, 0x40, 0x04,
    0x1E, 0x02, 0x0E, 0x0C, 0xF0, 0x44, 0xFE, 0x90,  0x20, 0xFA, 0x0D, 0x20, 0xF7, 0x1D, 0x20, 0xF2,
    0x0E, 0x13, 0x24, 0x7C, 0x1E, 0x83, 0xFE, 0x62,  0x28, 0x06, 0x1E, 0xC1, 0xFE, 0x64, 0x20, 0x06,
    0x7B, 0xE2, 0x0C, 0x3E, 0x87, 0xE2, 0xF0, 0x42,  0x90, 0xE0, 0x42, 0x15, 0x20, 0xD2, 0x05, 0x20,
    0x4F, 0x16, 0x20, 0x18, 0xCB, 0x4F, 0x06, 0x04,  0xC5, 0xCB, 0x11, 0x17, 0xC1, 0xCB, 0x11, 0x17,
    0x05, 0x20, 0xF5, 0x22, 0x23, 0x22, 0x23, 0xC9,  0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
    0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,  0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
    0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,  0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
    0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,  0x3C, 0x42, 0xB9, 0xA5, 0xB9, 0xA5, 0x42, 0x3C,
    0x21, 0x04, 0x01, 0x11, 0xA8, 0x00, 0x1A, 0x13,  0xBE, 0x20, 0xFE, 0x23, 0x7D, 0xFE, 0x34, 0x20,
    0xF5, 0x06, 0x19, 0x78, 0x86, 0x23, 0x05, 0x20,  0xFB, 0x86, 0x20, 0xFE, 0x3E, 0x01, 0xE0, 0x50
);

const BIOS_GB_2 = Uint8Array.of(
    0x31, 0xFE, 0xFF, 0xAF, 0x21, 0xFF, 0x9F, 0x32,  0xCB, 0x7C, 0x20, 0xFB, 0x21, 0x26, 0xFF, 0x0E,
    0x11, 0x3E, 0x80, 0x32, 0xE2, 0x0C, 0x3E, 0xF3,  0xE2, 0x32, 0x3E, 0x77, 0x77, 0x3E, 0xFC, 0xE0,
    0x47, 0x11, 0x04, 0x01, 0x21, 0x10, 0x80, 0x1A,  0xCD, 0x95, 0x00, 0xCD, 0x96, 0x00, 0x13, 0x7B,
    0xFE, 0x34, 0x20, 0xF3, 0x11, 0xD8, 0x00, 0x06,  0x08, 0x1A, 0x13, 0x22, 0x23, 0x05, 0x20, 0xF9,
    0x3E, 0x19, 0xEA, 0x10, 0x99, 0x21, 0x2F, 0x99,  0x0E, 0x0C, 0x3D, 0x28, 0x08, 0x32, 0x0D, 0x20,
    0xF9, 0x2E, 0x0F, 0x18, 0xF3, 0x67, 0x3E, 0x64,  0x57, 0xE0, 0x42, 0x3E, 0x91, 0xE0, 0x40, 0x04,
    0x1E, 0x02, 0x0E, 0x0C, 0xF0, 0x44, 0xFE, 0x90,  0x20, 0xFA, 0x0D, 0x20, 0xF7, 0x1D, 0x20, 0xF2,
    0x0E, 0x13, 0x24, 0x7C, 0x1E, 0x83, 0xFE, 0x62,  0x28, 0x06, 0x1E, 0xC1, 0xFE, 0x64, 0x20, 0x06,
    0x7B, 0xE2, 0x0C, 0x3E, 0x87, 0xF2, 0xF0, 0x42,  0x90, 0xE0, 0x42, 0x15, 0x20, 0xD2, 0x05, 0x20,
    0x4F, 0x16, 0x20, 0x18, 0xCB, 0x4F, 0x06, 0x04,  0xC5, 0xCB, 0x11, 0x17, 0xC1, 0xCB, 0x11, 0x17,
    0x05, 0x20, 0xF5, 0x22, 0x23, 0x22, 0x23, 0xC9,  0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
    0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,  0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
    0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,  0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
    0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,  0x3C, 0x42, 0xB9, 0xA5, 0xB9, 0xA5, 0x42, 0x4C,
    0x21, 0x04, 0x01, 0x11, 0xA8, 0x00, 0x1A, 0x13,  0xBE, 0x20, 0xFE, 0x23, 0x7D, 0xFE, 0x34, 0x20,
    0xF5, 0x06, 0x19, 0x78, 0x86, 0x23, 0x05, 0x20,  0xFB, 0x86, 0x20, 0xFE, 0x3E, 0x01, 0xE0, 0x50
);

class MMU {
    _bios = BIOS_GB_2;
    _rom = [];
    _eram = new Uint8Array(0x8000);
    _wram = new Uint8Array(0x2001);
    _zram = new Uint8Array(0x80);
    _inbios = true;
    _carttype = 0;
    _ie = 0;
    _if = 0;
    _ramoffs = 0;
    _romoffs = 0x4000;

    _mbc = [{}, { rombank: 0, rambank: 0, ramon: 0, mode: 0}];

    constructor(gb){
        this.gb = gb;
        this.log = this.gb.createLogger('gb:mmu');
    }

    reset(){
        this._eram.fill(0);
        this._wram.fill(0);
        this._zram.fill(0);

        this._inbios = true;
        this._ie = 0;
        this._if = 0;

        this._carttype = 0;
        this._mbc[0] = {};
        this._mbc[1] = { rombank: 0, rambank: 0, ramon: 0, mode: 0 };
        this._romoffs = 0x4000;
        this._ramoffs = 0;

        this.log('reset');
    }

    load(cb){
        binaryFromFile('rom', rom => {
            if(!rom){
                this.log('cannot load rom');
                return cb(false);
            }
            this._rom = rom;
            this._carttype = this._rom[0x0147];
            this.log('ROM loaded', this._rom.length, 'bytes');
            if(typeof cb === 'function'){
                return cb();
            }
        });
    }

    readByte(addr){
        switch(addr & 0xF000){

            // read from BIOS (256b)/ROM0
            case 0x0000:
                if(this._inbios){
                    if(addr < 0x0100){
                        return this._bios[addr];
                    } else if(this.gb.cpu.programCounter === 0x0100){
                        this._inbios = false;
                        this.log('leaving BIOS');
                    }
                } else {
                    return this._rom[addr];
                }

            // read from ROM0
            case 0x1000:
            case 0x2000:
            case 0x3000:
                return this._rom[addr];

            // read from ROM1 (unbanked) (16k)
            case 0x4000:
            case 0x5000:
            case 0x6000:
            case 0x7000:
                return this._rom[this._romoffs + (addr & 0x3FFF)];

            // read from VRAM (8k)
            case 0x8000:
            case 0x9000:
                return this.gb.gpu._vram[addr & 0x1FFF];

            // read from external ram (8k)
            case 0xA000:
            case 0xB000:
                return this._eram[this._ramoffs + (addr & 0x1FFF)];

            // read from working ram (8k) / shadow ram (0xE000)
            case 0xC000:
            case 0xD000:
            case 0xE000:
                return this._wram[addr & 0x1FFF];

            case 0xF000:
                switch(addr & 0x0F00){
                    case 0x000:
                    case 0x100:
                    case 0x200:
                    case 0x300:
                    case 0x400:
                    case 0x500:
                    case 0x600:
                    case 0x700:
                    case 0x800:
                    case 0x900:
                    case 0xA00:
                    case 0xB00:
                    case 0xC00:
                    case 0xD00:
                        return this._wram[addr & 0x1FFF];

                    // gpu object attribute memory (160b)
                    case 0xE00:
                        return ((addr & 0xFF) < 0xA0) ? this.gb.gpu._oam[addr & 0xFF] : 0;

                    // zero-page (io unhandled)
                    case 0xF00:
                        if(addr === 0xFFFF){
                            return this._ie;
                        } else if(addr > 0xFF7F){
                            return this._zram[addr & 0x7F];
                        } else {
                            switch(addr & 0xF0){
                                case 0x00:
                                    switch(addr & 0xF){
                                        // JOYP
                                        case 0:
                                            return this.gb.key.readByte();

                                        case 4:
                                        case 5:
                                        case 6:
                                        case 7:
                                            return this.gb.timer.readByte(addr);

                                        // interrupt flags
                                        case 15:
                                            return this._if;

                                        default:
                                            return 0;
                                    }

                                case 0x10:
                                case 0x20:
                                case 0x30:
                                    return 0;

                                case 0x40:
                                case 0x50:
                                case 0x60:
                                case 0x70:
                                    return this.gb.gpu.readByte(addr);
                            }
                        }
                }
        }
    }

    readWord(addr){
        return this.readByte(addr) + (this.readByte(addr + 1) << 8);
    }


    writeByte(addr, val){
        switch (addr & 0xF000) {

            // ROM bank 0
            // MBC1: Turn external RAM on
            case 0x0000:
            case 0x1000:
                if(this._carttype === 1){
                    this._mbc[1].ramon = ((val & 0xF) === 0xA) ? 1 : 0;
                }
                break;

            // MBC1: ROM bank switch
            case 0x2000:
            case 0x3000:
                if(this._carttype === 1){
                    this._mbc[1].rombank &= 0x60;
                    val &= 0x1F;
                    if(!val){
                        val = 1;
                    }
                    this._mbc[1].rombank |= val;
                    this._romoffs = this._mbc[1].rombank * 0x4000;
                }
                break;

            // ROM bank 1
            // MBC1: RAM bank switch
            case 0x4000:
            case 0x5000:
                if(this._carttype === 1){
                    if(this._mbc[1].mode){
                        this._mbc[1].rambank = (val & 3);
                        this._ramoffs = this._mbc[1].rambank * 0x2000;
                    } else {
                        this._mbc[1].rombank &= 0x1F;
                        this._mbc[1].rombank |= ((val & 3) << 5);
                        this._ramoffs = this._mbc[1].rambank * 0x4000;
                    }
                }
                break;

            // set MBC1-mode
            case 0x6000:
            case 0x7000:
                if(this._carttype === 1){
                    this._mbc[1].mode = val & 1;
                }
                break;

            // VRAM
            case 0x8000:
            case 0x9000:
                this.gb.gpu._vram[addr & 0x1FFF] = val;
                this.gb.gpu.updateTile(addr & 0x1FFF, val);
                break;

            // External RAM
            case 0xA000:
            case 0xB000:
                this._eram[this._ramoffs + (addr & 0x1FFF)] = val;
                break;

            // Work RAM and echo
            case 0xC000:
            case 0xD000:
            case 0xE000:
                this._wram[addr & 0x1FFF] = val;
                break;

            // misc.
            case 0xF000:
                switch(addr & 0x0F00){

                    // echo RAM
                    case 0x000:
                    case 0x100:
                    case 0x200:
                    case 0x300:
                    case 0x400:
                    case 0x500:
                    case 0x600:
                    case 0x700:
                    case 0x800:
                    case 0x900:
                    case 0xA00:
                    case 0xB00:
                    case 0xC00:
                    case 0xD00:
                        this._wram[addr & 0x1FFF] = val;
                        break;

                    // OAM
                    case 0xE00:
                        if((addr & 0xFF) < 0xA0){
                            this.gb.gpu._oam[addr & 0xFF] = val;
                        }
                        this.gb.gpu.updateOam(addr, val);
                        break;

                    // Zeropage RAM, I/O, interrupts
                    case 0xF00:
                        if(addr === 0xFFFF){
                            this._ie = val;
                        } else if(addr > 0xFF7F){
                            this._zram[addr & 0x7F] = val;
                        } else {
                            switch(addr & 0xF0){
                                case 0x00:
                                    switch(addr & 0xF){
                                        case 0:
                                            this.gb.key.writeByte(val);
                                            break;
                                        case 4:
                                        case 5:
                                        case 6:
                                        case 7:
                                            this.gb.timer.writeByte(addr, val);
                                            break;
                                        case 15:
                                            this._if = val;
                                            break;
                                    }
                                    break;
                                case 0x10:
                                case 0x20:
                                case 0x30:
                                    break;

                                case 0x40:
                                case 0x50:
                                case 0x60:
                                case 0x70:
                                    this.gb.gpu.writeByte(addr, val);
                                    break;
                            }
                        }
                        break;
                }
                break;
        }
    }

    writeWord(addr, val){
        this.writeByte(addr, val & 0xFF);
        this.writeByte(addr + 1, val >> 8);
    }
}

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const GPU_LAST_LINE = SCREEN_HEIGHT - 1;

const GPU_MODE_HBLANK = 0;
const GPU_MODE_VBLANK = 1;
const GPU_MODE_SCANLINE_OAM = 2;
const GPU_MODE_SCANLINE_VRAM = 3;

const GPU_CLOCK_SCANLINE_OAM = 20;
const GPU_CLOCK_SCANLINE_VRAM = 43;
const GPU_CLOCK_HBLANK = 51;
const GPU_CLOCK_VBLANK = 114;

const GPU_COLORS = [
    [255, 255, 255, 255],
    [192, 192, 192, 255],
    [ 96,  96,  96, 256],
    [  0,   0,   0, 256]
];


class GPU {
    canvas = false;
    screen = false;

    _modeclock = 0;
    _mode = 0;
    _line = 0;
    _scan = 0;
    _tileset = [];

    _vram = new Uint8Array(8192);
    _oam = new Uint8Array(160);
    _reg = [];
    _objdata = [];
    _objdatasorted = [];
    _palette = { bg: [255, 255, 255, 255], obj0: [255, 255, 255, 255], obj1: [255, 255, 255, 255] };
    _scanrow = [];

    _yScroll = 0;
    _xScroll = 0;

    readByte(){
        return 0;
    }

    writeByte(addr, val){

    }

    constructor(gb, canvasId){
        this.gb = gb;
        this.cpu = gb.cpu;
        this.canvasId = canvasId;
        this.canvasElem = document.getElementById(canvasId);
        this.canvas = this.canvasElem.getContext('2d');
        this.log = this.gb.createLogger('gb:gpu');
        this.reset();
    }

    reset(){
        if(this.canvas.createImageData){
            this.screen = this.canvas.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        } else if(this.canvas.getImageData){
            this.screen = this.canvas.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        } else {
            this.screen = {
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT,
                data: new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4)
            }
        }

        this._tileset = [];
        for(var i = 0; i < 384; i++){
            this._tileset[i] = [];
            for(var j = 0; j < 8; j++){
                this._tileset[i][j] = [0, 0, 0, 0, 0, 0, 0, 0];
            }
        }

        this._vram.fill(0);
        this._oam.fill(0);

        this.screen.data.fill(0);
        this.renderScreen();
        this.log('reset');
    }

    updateTile(addr, val){
        /*let saddr = addr;
        if(addr & 1){
            saddr--;
            addr--;
        }

        let tile = (addr >> 4) & 511;
        let y = (addr >> 1) & 7;

        let sx;
        for(var x = 0; x < 8; x++){
            sx = 1 << (7 - x);
            this._tileset[tile][y][x] = ((this._vram[saddr] & sx) ? 1 : 0) + ((this._vram[saddr] & sx) ? 1 : 0);
        }*/
    }

    updateOam(addr, val){
        addr -= 0xFE00;
        let obj = addr >> 2;
        if(obj < 40){
            switch(addr & 3){
                case 0:
                    this._objdata[obj].y = val - 16;
                    break;
                case 1:
                    this._objdata[obj].x = val -8;
                    break;
                case 2:
                    if(this._objsize){
                        this._objdata[obj].tile = (val & 0xFE);
                    } else {
                        this._objdata[obj].tile = val;
                    }
                    break;
                case 3:
                    this._objdata[obj].palette = (val & 0x10) ? 1 : 0;
                    this._objdata[obj].xflip   = (val & 0x20) ? 1 : 0;
                    this._objdata[obj].yflip   = (val & 0x40) ? 1 : 0;
                    this._objdata[obj].prio    = (val & 0x80) ? 1 : 0;
                    break;
            }
        }
        this._objdatasorted = this._objdata;
        this._objdatasorted.sort((a, b) => {
            if(a.x > b.x){
                return -1;
            }
            if(a.num > b.num){
                return -1;
            }
        });
    }

    writeByte(addr, val){
        let gaddr = addr - 0xFF40;
        this._reg[gaddr] = val;


        switch(addr & 0xF000){
            case 0x8000:
            case 0x9000:
                this._vram[addr & 0x1FFF] = val;
                this.updateTile(addr, val);
                break;
        }
    }

    renderScreen(){
        this.canvas.putImageData(this.screen, 0, 0);
    }

    renderScan(){
        if(this._lcdon){
            if(this._bgon){
                let linebase = this._scan;
                let mapbase = this._bgmapbase + ((((this._line + this._yScroll) & 255) >> 3) << 5);
                let y = (this._line + this._yScroll) & 7;
                let x = this._xScroll & 7;
                let t = (this._xScroll >> 3) & 31;
                let pixel;
                let w = 160;

                if(this._bgTilebase){
                    let tile = this._vram[mapbase + t];
                    if(tile < 128){
                        tile += 256;
                    }
                    let tilerow = this._tileset[tile][y];
                    do {
                        this._scanrow[160 - x] = tilerow[x];
                        this.screen.data[linebase + 3] = this._palette.bg[tilerow[x]];
                        x++;
                        if(x === 8){
                            t = (t + 1) & 31;
                            x = 0;
                            tile = this._vram[mapbase + t];

                            if(tile < 128){
                                tile += 256;
                            }

                            tilerow = this._tileset[tile][y];
                        }
                        linebase += 4;
                    } while(--w);
                } else {
                    let tilerow = this._tileset[this._vram[mapbase + t]][y];
                    do {
                        this._scanrow[160 - x] = tilerow[x];
                        this.screen.data[linebase + 3] = this._palette.bg[tilerow[x]];
                        x++;
                        if(x === 8){
                            t = (t + 1) & 31;
                            x = 0;
                            tilerow = this._tileset[this._vram[mapbase + t]][y];
                        }
                        linebase += 4;
                    } while(--w);
                }
            }

            if(this._objon){
                let cnt = 0;
                if(!this._objsize){

                }
            }
        }

        // vram offset for the tile map
        let mapoffs = this._bgmap ? 0x1C00 : 0x1800;
        // which line of tiles to use in the map
        mapoffs += ((this._line + this._scy) & 255) >> 3;
        // which tile to start with in the tile map
        let lineoffs = (this._scx >> 3);
        // which line of pixels to use in the tiles
        let y = (this._line + this._scy) & 7;
        // where in the tileline to star
        let x = this._scx & 7;
        // where to render on the canvas
        let canvasoffs = this._line * SCREEN_WIDTH * 4;
        // read tile index from the background map
        let color;
        let tile = this._vram[mapoffs + lineoffs];

        // if tile data is #1, indices are signed. calc real tile offset
        if(this._bgtile === 1 && tile < 128){
            tile += 256;
        }

        for (var i = 0; i < SCREEN_WIDTH; i++) {
            color = GPU_COLORS[this._tileset[tile][y][x]];
            this.screen.data.set(color, canvasoffs);
            canvasoffs += 4;

            x++;
            if(x === 8){
                x = 0;
                lineoffs = (lineoffs + 1) & 31;
                tile = this._vram[mapoffs + lineoffs];
                if(this._bgtile === 1 && tile < 128){
                    tile += 256;
                }
            }
        }
    }

    step(){
        this._modeclock += this.cpu.clock.m;

        // hblank
        // after the last hblank, push screen to canvas
        if(this._mode === GPU_MODE_HBLANK && this._modeclock >= GPU_CLOCK_HBLANK){
            if(this._line === GPU_LAST_LINE){
                // enter vblank
                this._mode = GPU_MODE_VBLANK;
                this.renderScreen();
                this.gb.mmu._if |= 1;
            } else {
                this._mode = GPU_MODE_SCANLINE_OAM;
            }
            this._modeclock = 0;
            this._line++;
            this._scan += 640;
        }

        // hblank
        else if(this._mode === GPU_MODE_VBLANK && this._modeclock >= GPU_CLOCK_VBLANK){
            this._modeclock = 0;
            this._line++;

            if(this._line > 153){
                this._mode = GPU_MODE_SCANLINE_OAM;
                this._line = 0;
                this._scan = 0;
            }
        }

        // OAM read mode, scanline active
        else if(this._mode === GPU_MODE_SCANLINE_OAM && this._modeclock >= GPU_CLOCK_SCANLINE_OAM){
            // enter scanline mode vram
            this._modeclock = 0;
            this._mode = GPU_MODE_SCANLINE_VRAM;
        }

        // VRAM read mode, scanline active
        // Treat end of vram-mode as scanline
        else if(this._mode === GPU_MODE_SCANLINE_VRAM && this._modeclock >= GPU_CLOCK_SCANLINE_VRAM){
            // enter hblank
            this._modeclock = 0;
            this.mode = GPU_MODE_HBLANK;

            this.renderScan();
        }
    }
}

class Key {
    readByte(){ return 0; }
    writeByte(){}
    reset(){
        this.log('reset');
    }
    constructor(gb){
        this.gb = gb;
        this.log = this.gb.createLogger('gb:key');
    }
}

class Timer {
    readByte(){ return 0; }
    writeByte(){}
    reset(){
        this.log('reset');
    }
    constructor(gb){
        this.gb = gb;
        this.log = this.gb.createLogger('gb:timer');
    }
}

/*let gb = new GB();
gb.reset();
gb.mm.load(() => {
    gb.run();
});*/
