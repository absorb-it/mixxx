/*


*/

// eslint-disable-next-line no-var
var DDJXP2 = { };


DDJXP2.RGBPioneerCode  = function(r, g, b, dim = 0) {
    const n = Math.min(Math.min(r, g), b);
    const v = Math.max(Math.max(r, g), b);
    const m = v - n;
    let h = 0;
    if (v === 0) {
        h = 0x00;    // black
    } else if (m === 0) {
        h = 0x40;    // white
    } else if (r === n) {
        h = 3 + (b - g)/m;
    } else if (g === n) {
        h = 5 + (r - b)/m;
    } else {
        h = 1 + (g - r)/m;
    }
    h = 10.2*((10 - h) % 6) + 1; // re-aligned colorwheel
    if (dim) {
        return h + 0x40;
    } else {
        return h;
    }
};

components.Component.prototype.shiftOffset = 1;
components.Component.prototype.shiftChannel = true;
components.Component.prototype.sendShifted = true;

DDJXP2.ThreeButtonSelector = class extends components.Button {
    constructor(options) {
        options.outTrigger = false;
        super(options);
        this.selection = [0, 0, 0];
        this.offset = options.offset;
    };
    inSetParameter(value, position) {
        engine.setParameter(this.groupArray[position], this.inKey, value);
    };
    input(_channel, control, value, _status, _group) {
        if (value) {
            for (let i = 0; i < 3; i++) {
                if (this.selection[i]) {
                    this.inSetParameter(this.inValueScale(0x00), i);
                    this.selection[i] = 0;
                } else if (i === (control - this.offset)) {
                    this.inSetParameter(this.inValueScale(0x7F), i);
                    this.selection[i] = 1;
                }
            }
        }
    };
    send(value, position) {
        this.midi = this.midibase[position];
        super.send(value);
    };
    connect() {
        for (let i = 0; i < 3; i++) {
            this.connections[i] = engine.makeConnection(this.groupArray[i], this.outKey, this.output.bind(this));
        };
    };
    output(value, group, _control) {
        for (let i = 0; i < 3; i++) {
            if (value) {
                if (this.groupArray[i] !== group) {
                    if (this.selection[i]) {
                        // resetting any other activated Option
                        this.inSetParameter(this.inValueScale(0x00), i);
                        this.selection[i] = 0;
                    }
                } else {
                    // activating selected Option
                    this.send(this.outValueScale(value), i);
                    this.selection[i] = value;
                    if (typeof this.setExternalModifier === "function") {
                        this.setExternalModifier(i + 1);
                    }
                }
            } else {
                if (this.groupArray[i] === group) {
                    // dectivating of button is pressed again
                    this.send(this.outValueScale(value), i);
                    this.selection[i] = value;
                    if (typeof this.setExternalModifier === "function") {
                        this.setExternalModifier(0);
                    }

                }
            }
        }
    };
};



DDJXP2.init = function() {
    this.controls2deck = new components.ComponentContainer({
        left: new DDJXP2.DeckControls2Deck([1, 3], 0),
        right: new DDJXP2.DeckControls2Deck([2, 4], 1),
    });

    this.controls4deck = new components.ComponentContainer({
        one: new DDJXP2.DeckControls4Deck([1], 0),
        two: new DDJXP2.DeckControls4Deck([2], 1),
        three: new DDJXP2.DeckControls4Deck([3], 2),
        four: new DDJXP2.DeckControls4Deck([4], 3),
    });

    this.shiftButton = new components.Button({
        input: function(_channel, _control, value, _status, _g) {
            if (value) {
                DDJXP2.controls4deck.shift();
                DDJXP2.controls2deck.shift();
            } else {
                DDJXP2.controls4deck.unshift();
                DDJXP2.controls2deck.unshift();
            }
        },
    });

    this.rotarySelector = new components.Pot({
        input: function(_channel, control, value, _status, _group) {
            if (value === 0x01) {
                engine.setValue("[Library]", (control === 0x40)?"MoveDown":"MoveRight", true);
            } else {
                engine.setValue("[Library]", (control === 0x40)?"MoveUp":"MoveLeft", true);
            }
        },
        inputPress: function(_channel, _control, value, _status, _group) {
            if (value) {
                engine.setValue("[Library]", "MoveFocusForward", true);
            }
        },
    });

    // startup: reset Deck and PadMode selection
    midi.sendShortMsg(0x92, 0x72, 0x00);
    midi.sendShortMsg(0x93, 0x72, 0x00);

    const modeBtnColor1 = DDJXP2.RGBPioneerCode(80, 0, 255);
    const modeBtnColor2 = DDJXP2.RGBPioneerCode(255, 255, 0);
    for (let i = 0x93; i >= 0x90; i--) {
        for (let j = 0x6F; j >= 0x69; j--) {
            midi.sendShortMsg(i, j, modeBtnColor2);
        }
        for (let j = 0x22; j >= 0x1B; j--) {
            midi.sendShortMsg(i, j, modeBtnColor1);
        }
    }

    engine.beginTimer(500, function() {
        DDJXP2.controls2deck.left.toggleDeck.input = DDJXP2.controls2deck.left.toggleDeck.inputReal;
        DDJXP2.controls2deck.right.toggleDeck.input = DDJXP2.controls2deck.right.toggleDeck.inputReal;
    }, true);

    engine.setValue("[Skin]", "show_4decks", true);
    engine.setValue("[Skin]", "show_4effectunits", true);
};

DDJXP2.PadMode = class extends components.ComponentContainer {
    constructor(options) {
        super(options);
        // this is a workaround for components, forEachComponent only iterates
        // over ownProperties, so these have to constructed by the constructor here
        // instead of being merged by the ComponentContainer constructor
        this.pads = Array(16).fill(undefined);
    }
    constructPads(constructPad) {
        this.pads = this.pads.map((_, padIndex) => constructPad(padIndex));
    }
};

DDJXP2.PadModeSlicer = class extends DDJXP2.PadMode {
    constructor(group) {
        super();
        this.group = group;
        this.beat = -1;
        this.useSlip = engine.getSetting("useSlipOnSlicer");
        this.pressed = [false, false, false, false, false, false, false, false];
        this.startPos = -1;
        this.samplesBetweenSlices = undefined;
        const SlicerContainer = this;
        this.parameterLeft = {
            input(_channel, _control, value, _status, _group) {
                if (value) {
                    SlicerContainer.startPos -= SlicerContainer.samplesBetweenSlices;
                    SlicerContainer.activate(1, 0);
                    SlicerContainer.updateLoop();
                }
            }
        };
        this.parameterRight = {
            input(_channel, _control, value, _status, _group) {
                if (value) {
                    SlicerContainer.startPos += SlicerContainer.samplesBetweenSlices;
                    SlicerContainer.activate(1, 0);
                    SlicerContainer.updateLoop();
                }
            }
        };
        this.activate(0);
    }
    updateLoop() {
        // If at least one button is pressed, create a loop between those points
        const startPad = this.pressed.indexOf(true);
        const endPad = this.pressed.lastIndexOf(true);

        if (startPad !== -1) {
            engine.setValue(this.group, "loop_start_position", this.pads[startPad].startSample);
            engine.setValue(this.group, "loop_end_position", this.pads[endPad].endSample);

            // move playing position if not in resulting loop
            const beatSize = engine.getValue(this.group, "beatloop_size")/8;

            if (this.beat < startPad) {
                engine.setValue(this.group, "beatjump", beatSize * (startPad - this.beat));
            }
            if (this.beat > endPad) {
                engine.setValue(this.group, "beatjump", beatSize * (endPad - this.beat));
            }

            if (this.useSlip) {
                engine.setValue(this.group, "slip_enabled", 1);
            }
            engine.setValue(this.group, "loop_enabled", 1);

        } else {
            engine.setValue(this.group, "loop_start_position", this.startPos);
            engine.setValue(this.group, "loop_end_position", this.startPos + 8 * this.samplesBetweenSlices);
            engine.setValue(this.group, "loop_enabled", (this.type !== "SlicerLoop"));
            if (this.useSlip) {
                engine.setValue(this.group, "slip_enabled", (this.type !== "SlicerLoop"));
            }
        }

        this.forEachComponent(function(component) {
            if (typeof component.activate === "function") {
                component.output(component.number >= startPad && component.number <= endPad);
            }
        });
    }
    samplesPerBeat(group) {
        const sampleRate = engine.getValue(group, "track_samplerate");
        const bpm = engine.getValue(group, "local_bpm");
        // The sample rate includes both channels (i.e. it is double the framerate)
        // Hence, we multiply by 2*60 (120) instead of 60 to get the correct sample rate
        const secondsPerBeat = 120/bpm;
        const samplesPerBeat = secondsPerBeat * sampleRate;
        return samplesPerBeat;
    }
    // This connection will reinitialize Slicer when the beatloop size spinbox changes
    slicerSizeChange(_value, _group, _control) {
        this.activate(1, 0);
        this.updateLoop();
    }
    // This function will count beats and move the Slicer section forward when needed
    slicerCountBeat(_value, _group, _control) {
        // Calculate current position in samples
        const currentPos = engine.getValue(this.group, "track_samples") * engine.getValue(this.group, "playposition");
        // Calculate beat
        let beat = 0;
        for (let i = 0; i < 8; i++) {
            beat = (currentPos >= this.pads[i].endSample) ? (beat + 1) : beat;
        }

        // If the beat count has changed, update the object property's value
        if (this.beat !== beat) {
            this.beat = beat;
        };

        // If in slicer mode (not slicer loop mode), check to see if the slicer section needs to be moved
        if (beat > 7) {
            this.startPos = this.pads[7].endSample;
            this.activate(0);
            this.activate(1);
        }
    }
    slip(status, control, value) {
        if (value) {
            this.useSlip = !this.useSlip;
            midi.sendShortMsg(this.midi[0], this.midi[1], (this.useSlip !== engine.getSetting("useSlipOnSlicer"))?this.slipOn:this.slipOff);
        }
    }
    init(status, control, value) {
        switch (value) {
        case 0:
            this.activate(0);
            break;
        case 1:
        case 2:
            this.activate(1, 1);
            this.midi = [status, control];
            midi.sendShortMsg(this.midi[0], this.midi[1], (this.useSlip !== engine.getSetting("useSlipOnSlicer"))?this.slipOn:this.slipOff);
            break;
        }
    }
    activate(enter = 0, renewStart = 1) {
        if (enter) {
            if (renewStart) {
                this.startPos = engine.getValue(this.group, "beat_closest");
            }
            this.samplesBetweenSlices = this.samplesPerBeat(this.group) * engine.getValue(this.group, "beatloop_size") / 8;
            this.forEachComponent(function(component) {
                if (typeof component.activate === "function") {
                    component.activate();
                }
            });

            if (this.beatConnection === undefined) {
                this.beatConnection = engine.makeConnection(this.group, "beat_distance", this.slicerCountBeat.bind(this));
                this.sizeConnection = engine.makeConnection(this.group, "beatloop_size", this.slicerSizeChange.bind(this));
                this.loadConnection = engine.makeConnection(this.group, "LoadSelectedTrack", this.activate.bind(this));
            };

            engine.setValue(this.group, "loop_start_position", this.startPos);
            engine.setValue(this.group, "loop_end_position", (this.startPos + 8 * this.samplesBetweenSlices));
            engine.setValue(this.group, "loop_enabled", (this.type !== "SlicerLoop"));
        } else {
            this.forEachComponent(function(component) {
                if (typeof component.activate === "function") {
                    component.deactivate();
                }
            });
            if (this.beatConnection !== undefined) {
                this.beatConnection.disconnect();
                this.sizeConnection.disconnect();
                this.loadConnection.disconnect();
                // Make loop position indicators disappear as visual feedback
                engine.setValue(this.group, "loop_start_position", -1);
                engine.setValue(this.group, "loop_end_position", -1);
                if (this.useSlip) {
                    engine.setValue(this.group, "slip_enabled", 0);
                }
                engine.setValue(this.group, "loop_enabled", 0);

                this.beatConnection = undefined;
            }
        }
    }
};

DDJXP2.SlicerButton = class extends components.Button {
    constructor(options, padContainer) {
        super(options);
        this.padContainer = padContainer;
        this.output(0x00);
    }
    activate() {
        this.startSample = this.padContainer.startPos + this.number * this.padContainer.samplesBetweenSlices;
        this.endSample = this.padContainer.startPos + (this.number + 1) * this.padContainer.samplesBetweenSlices;
    }
    deactivate() {
        this.startSample = -1;
        this.endSample = -1;
    }
    input(_channel, _control, value, _status, _group) {
        this.padContainer.pressed[this.number] = (value !== 0);

        if (this.startSample !== -1) {
            this.padContainer.updateLoop();
        }
    }
    outValueScale(value) {
        return value?this.on:this.off;
    }
};

const midiAssignment = [0xC, 0xD, 0xE, 0xF, 0x8, 0x9, 0xA, 0xB, 0x4, 0x5, 0x6, 0x7, 0x0, 0x1, 0x2, 0x3];

DDJXP2.PadRows = {
    sampler: function(deckOffset, _group, i, midiOffset) {
        const row = Math.floor(i / 4);
        return new components.SamplerButton({
            midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
            number: (deckOffset % 2) * 4 + i - (row * 4) +1,
            on: DDJXP2.RGBPioneerCode(0, 255, 0, true),
            off: 0x3F,
        });
    },
    jump: function(deckOffset, group, i, midiOffset) {
        const pos = i % 4;
        if (pos === 0) {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "beatjump_backward",
                on: DDJXP2.RGBPioneerCode(255, 0, 255),
                off: DDJXP2.RGBPioneerCode(255, 0, 255, true),
            });
        } else if (pos === 1) {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "beatjump_size_halve",
                on: DDJXP2.RGBPioneerCode(100, 0, 255),
                off: DDJXP2.RGBPioneerCode(100, 0, 255, true),
            });
        } else if (pos === 2) {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "beatjump_size_double",
                on: DDJXP2.RGBPioneerCode(100, 0, 255),
                off: DDJXP2.RGBPioneerCode(100, 0, 255, true),
            });
        } else {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "beatjump_forward",
                on: DDJXP2.RGBPioneerCode(255, 0, 255),
                off: DDJXP2.RGBPioneerCode(255, 0, 255, true),
            });
        }
    },
    play: function(deckOffset, group, i, midiOffset) {
        const pos = i % 4;
        if (pos === 0) {
            return new components.PlayButton({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                on: DDJXP2.RGBPioneerCode(255, 30, 0),
            });
        } else if (pos === 1) {
            return new components.CueButton({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                on: DDJXP2.RGBPioneerCode(255, 30, 0),
            });
        } else if (pos === 2) {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "start",
                on: DDJXP2.RGBPioneerCode(0, 0, 255),
                off: DDJXP2.RGBPioneerCode(0, 0, 255, true),
            });
        } else {
            return new components.Button({
                midi: [0x97 + (deckOffset * 2), midiOffset + midiAssignment[i]],
                group,
                key: "end",
                on: DDJXP2.RGBPioneerCode(0, 0, 255),
                off: DDJXP2.RGBPioneerCode(0, 0, 255, true),
            });
        }
    },
};

/* PAD implementation
 *
 * PAD1:    8 Hotcues, Play line and 4 Samplers or 8 Samplers (Parameter scrolls through sampler, how to indicate that ???)
 * PAD2:    Loop's (Slip or not) and 4 Samplers
 * PAD3:    Jump's and 4 Samplers
 * PAD4:    Effect's and 4 Samplers
 *
 * PAD5:    Slicer and 4 Samplers
 * PAD6:    SlicerRoll and 4 Samplers
 * PAD7:    Pitch change and 4 Samplers
 * PAD8:    Key change and 4 Samplers
 *
 */

/* recordbox PADs (also Labeling for XP1)
 *
 * PAD1:    Hot Cue
 * PAD2:    PAD FX1
 * PAD3:    Beat Jump
 * PAD4:    Sampler
 *
 * PAD5:    Keyboard
 * PAD6:    PAD FX2
 * PAD7:    Beat Loop
 * PAD8:    Beat Shift
 *
 */
DDJXP2.PadModeContainers = {
    hotCue: class extends DDJXP2.PadMode {
        // 1-8: HotCue
        // 9-16: Sampler
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();

            super.constructPads(i => {
                if (i < 4) {
                    return DDJXP2.PadRows.play(deckOffset, group, i, padNr * 0x10);
                } else if (i < 12) {
                    return new components.HotcueButton({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        number: i - 3,
                        group,
                        color: DDJXP2.RGBPioneerCode(255, 128, 0),
                        connect: function() {
                            if (this.connections[0] === undefined) {
                                components.Component.prototype.connect.call(this, arguments);
                            }
                        },
                        outValueScale: function(value) {
                            return (value)?this.color:0x00;
                        },
                    });
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
    },
    beatLoop: class extends DDJXP2.PadMode {
        // 1-12: Auto-Loop
        // 13: BeatJump left, 14: 1/2x BeatJump Size, 15: 2x BeatJump Size, 16: BeatJump right
        constructor(padNr, deckOffset, group, modeBtnColor, modeBtnAttnColor) {
            super();
            const theContainer = this;
            this.currentBaseLoopSize = parseInt(engine.getSetting("defaultLoopRootSize"));
            this.useSlip = engine.getSetting("useSlipOnLoops");
            this.slipOn = modeBtnAttnColor;
            this.slipOff = modeBtnColor;

            this.parameterLeft = new components.Button({
                group: group,
                key: "loop_halve",
            });
            this.parameterRight = new components.Button({
                group: group,
                key: "loop_double",
            });

            super.constructPads(i => {
                if (i < 12) {
                    const loopSize = Math.pow(2, theContainer.currentBaseLoopSize + i);
                    return new components.Button({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        group,
                        inKey: `beatloop_${loopSize}_toggle`,
                        outKey: `beatloop_${loopSize}_enabled`,
                        on: DDJXP2.RGBPioneerCode(128, 160, 0),
                        off: DDJXP2.RGBPioneerCode(128, 160, 0, true),
                    });
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
        slip(status, control, value) {
            if (value) {
                this.useSlip = !this.useSlip;
                midi.sendShortMsg(this.midi[0], this.midi[1], (this.useSlip !== engine.getSetting("useSlipOnLoops"))?this.slipOn:this.slipOff);
            }
        }
        init(status, control, value) {
            switch (value) {
            case 0:
                break;
            case 1:
            case 2:
                this.midi = [status, control];
                midi.sendShortMsg(this.midi[0], this.midi[1], (this.useSlip !== engine.getSetting("useSlipOnLoops"))?this.slipOn:this.slipOff);
                break;
            }
        }
    },
    slicer: class extends DDJXP2.PadModeSlicer {
        // 1-8: Slicer
        // 9-16: Sampler
        constructor(padNr, deckOffset, group, modeBtnColor, modeBtnAttnColor) {
            super(group);
            this.type = "SlicerLoop";
            this.slipOn = modeBtnAttnColor;
            this.slipOff = modeBtnColor;

            const padContainer = this;
            super.constructPads((i) => {
                if (i < 8) {
                    // Slicer copied and adapted from Hercules-DJControl-Inpulse-300-script.js
                    return new DDJXP2.SlicerButton({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        number: i,
                        group: group,
                        on: DDJXP2.RGBPioneerCode(0, 255, 255),
                        off: DDJXP2.RGBPioneerCode(0, 255, 255, true),
                    }, padContainer);
                } if (i < 12) {
                    return DDJXP2.PadRows.jump(deckOffset, group, i, padNr * 0x10);
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
    },
    beatJump: class extends DDJXP2.PadMode {
        // 1-12: Jump
        // 13: BeatJump left, 14: 1/2x BeatJump Size, 15: 2x BeatJump Size, 16: BeatJump right
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            const theContainer = this;
            this.currentBaseJumpSize = parseInt(engine.getSetting("defaultBeatJumpRootSize"));
            this.parameterLeft = new components.Button({
                group: group,
                key: "beatjump_size_halve",
            });
            this.parameterRight = new components.Button({
                group: group,
                key: "beatjump_size_double",
            });

            super.constructPads(i => {
                if (i < 12) {
                    const loopSize = Math.pow(2, theContainer.currentBaseJumpSize + i);
                    return new components.Button({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        group,
                        on: DDJXP2.RGBPioneerCode(128, 0, 160),
                        off: DDJXP2.RGBPioneerCode(128, 0, 160, true),
                        key: `beatjump_${loopSize}_${  (i % 2)?"forward":"backward"}`,
                    });
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
    },
    keyShift: class extends DDJXP2.PadMode {
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            const theContainer = this;

            super.constructPads(i => {
                if (i < 12) {
                    // offset from -6 to +6
                    const offset = (((2 - Math.floor(i / 4)) * 4 + (i % 4)) - 5.5) * 12 / 11;
                    return new components.Button({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        number: i,
                        offset,
                        group,
                        on: DDJXP2.RGBPioneerCode(255 + (offset - 6) * 20, 0, 255 - (offset + 6) * 20),
                        off: DDJXP2.RGBPioneerCode(255 + (offset - 6) * 20, 0, 255 - (offset + 6) * 20, true),
                        input(channel, control, value, status, group) {
                            if (value) {
                                const newOffset = this.offset;
                                if (engine.getValue(group, "pitch_adjust") === newOffset) {
                                    engine.setValue(group, "reset_key", 0x7F);
                                } else {
                                    engine.setValue(group, "pitch_adjust", newOffset);
                                }
                            }
                            theContainer.updateLEDs();
                        },
                        updateLED() {
                            this.output(engine.getValue(this.group, "pitch_adjust"));
                        },
                        outValueScale(value) {
                            return (value === this.offset)?this.on:this.off;
                        },
                    });
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
        init(status, control, value) {
            switch (value) {
            case 0:
                break;
            case 1:
            case 2:
                this.updateLEDs();
                break;
            }
        }
        updateLEDs() {
            this.forEachComponent(function(component) {
                if (typeof component.updateLED === "function") {
                    component.updateLED();
                }
            });
        }
    },
    keyPad: class extends DDJXP2.PadMode {
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            const theContainer = this;
            super.constructPads(i => {
                if (i < 12) {
                    // offset from -6 to 6 without 0
                    let offset = (2 - Math.floor(i / 4)) * 4 + (i % 4);
                    offset += (offset < 6)?-6:-5;
                    const colorR = (offset < 0)?(255 + (offset - 6) * 20):(255 + (offset - 6) * 8);
                    const colorB = (offset < 0)?(255 - (offset + 6) * 8):(255 - (offset + 6) * 20);

                    return new components.Button({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        number: i,
                        offset,
                        group,
                        on: DDJXP2.RGBPioneerCode(colorR, 0, colorB),
                        off: DDJXP2.RGBPioneerCode(colorR, 0, colorB, true),
                        active: false,
                        input(channel, control, value, status, group) {
                            if (value) {
                                engine.setValue(group, "reset_key", 0x7F);
                                this.active = !this.active;
                                if (this.active) {
                                    let newOffset = this.offset;
                                    if (newOffset < 0) {
                                        while (newOffset++ < 0) {
                                            engine.setValue(group, "pitch_down", 0x7F);
                                        }
                                    } else {
                                        while (newOffset-- > 0) {
                                            engine.setValue(group, "pitch_up", 0x7F);
                                        }
                                    }
                                    theContainer.deactivatePads();
                                    this.active = true;
                                }
                            }
                            theContainer.updateLEDs();
                        },
                        updateLED() {
                            this.output(this.active);
                        },
                        outValueScale(value) {
                            return value?this.on:this.off;
                        },
                    });
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
        init(status, control, value) {
            switch (value) {
            case 0:
                break;
            case 1:
            case 2:
                this.updateLEDs();
                break;
            }
        }
        deactivatePads() {
            this.forEachComponent(function(component) {
                component.active = false;
            });
        }
        updateLEDs() {
            this.forEachComponent(function(component) {
                if (typeof component.updateLED === "function") {
                    component.updateLED();
                }
            });
        }
    },
    slicerRoll: class extends DDJXP2.PadModeSlicer {
        // 1-8: Slicer
        // 9-16: Sampler
        constructor(padNr, deckOffset, group, modeBtnColor, modeBtnAttnColor) {
            super(group);
            this.type = "SlicerLoopRoll";
            this.slipOn = modeBtnAttnColor;
            this.slipOff = modeBtnColor;
            const padContainer = this;
            super.constructPads((i) => {
                if (i < 8) {
                    // Slicer copied and adapted from Hercules-DJControl-Inpulse-300-script.js
                    return new DDJXP2.SlicerButton({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        number: i,
                        group: group,
                        on: DDJXP2.RGBPioneerCode(0, 255, 255),
                        off: DDJXP2.RGBPioneerCode(0, 255, 255, true),
                    }, padContainer);
                } if (i < 12) {
                    return DDJXP2.PadRows.jump(deckOffset, group, i, padNr * 0x10);
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
    },
    sampler: class extends DDJXP2.PadMode {
        constructor(padNr, deckOffset, _group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            super.constructPads(i => new components.SamplerButton({
                midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                number: i + 1,
                on: DDJXP2.RGBPioneerCode(0, 255, 0, true),
                off: 0x3F,
            })
            );
        }
    },
    quickEffect: class extends DDJXP2.PadMode {
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            this.deckOffset = deckOffset;
            this.group = group;
            super.constructPads(i => new components.Button({
                midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                group: `[QuickEffectRack1_${group}]`,
                key: "loaded_chain_preset",
                number: i + 1,
                on: DDJXP2.RGBPioneerCode(0, 255, 0),
                off: 0x7F,
                input(_channel, _control, value, _status, _group) {
                    if (value) {
                        if (engine.getValue(this.group, this.key) !== this.number) {
                            engine.setValue(this.group, this.key, this.number);
                        } else {
                            engine.setValue(this.group, this.key, 1);
                        }
                    }
                },
                outValueScale(value) {
                    return (value === this.number)?this.on:this.off;
                },
            })
            );
        }
        init(status, control, value) {
            Object.values(DDJXP2.controls2deck)[(this.deckOffset) % 2].fader.useForEffectPads(value, this.group);
        }
    },
    equalizerRack: class extends DDJXP2.PadMode {
        constructor(padNr, deckOffset, group, _modeBtnColor, _modeBtnAttnColor) {
            super();
            super.constructPads((i) => {
                if (i < 8) {
                    return new components.Button({
                        midi: [0x97 + (deckOffset * 2), padNr * 0x10 + midiAssignment[i]],
                        group: `[EqualizerRack1_${group}]`,
                        key: "loaded_chain_preset",
                        number: i + 2,
                        on: DDJXP2.RGBPioneerCode(255, 128, 0),
                        off: 0x7F,
                        input(_channel, _control, value, _status, _group) {
                            if (value) {
                                if (engine.getValue(this.group, this.key) !== this.number) {
                                    engine.setValue(this.group, this.key, this.number);
                                } else {
                                    engine.setValue(this.group, this.key, 1);
                                }
                            }
                        },
                        outValueScale(value) {
                            return (value === this.number)?this.on:this.off;
                        },
                    });
                } if (i < 12) {
                    return DDJXP2.PadRows.jump(deckOffset, group, i, padNr * 0x10);
                } else {
                    return DDJXP2.PadRows.sampler(deckOffset, group, i, padNr * 0x10);
                }
            });
        }
    },
};



DDJXP2.DeckControls4Deck = class extends components.Deck {
    constructor(deckNumbers, midiChannel) {
        super(deckNumbers);

        const theDeck = this;

        this.beatLoop4 = new components.Button({
            midi: [0x90 + midiChannel, 0x14],
            sendShifted: true,
            shiftChannel: false,
            shiftControl: true,
            shiftOffset: 60,
            key: "beatloop_4",
            type: components.Button.prototype.types.toggle,

        });

        this.halfLoop = new components.Button({
            input: function(_channel, _control, value, _status, _g) {
                if (value) {
                    const size = engine.getValue(this.group, "beatloop_size");
                    engine.setValue(this.group, "beatloop_size", size/2);
                }
            }
        });

        this.doubleLoop = new components.Button({
            input: function(_channel, _control, value, _status, _g) {
                if (value) {
                    const size = engine.getValue(this.group, "beatloop_size");
                    engine.setValue(this.group, "beatloop_size", size*2);
                }
            }
        });

        this.quantize = new components.Button({
            midi: [0x90 + midiChannel, 0x35],
            sendShifted: true,
            shiftChannel: false,
            shiftControl: true,
            shiftOffset: 4,
            type: components.Button.prototype.types.toggle,
            key: "quantize",
        });

        this.slipReverse = new components.Button({
            midi: [0x90 + midiChannel, 0x15],
            key: "reverseroll",
            input: function(_channel, control, value, status, _g) {
                const target = theDeck.padMode.getPadModeInstance();
                if (target && target.slip && typeof target.slip === "function") {
                    target.slip(status, control, value);
                } else {
                    components.Button.prototype.input.call(this, arguments);
                };
            }
            // shiftChannel: false,
            // shiftControl: true,
            // shiftOffset: 0x3C,
        });

        this.masterTempo = new components.Button({
            midi: [0x90 + midiChannel, 0x1A],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 70,
            type: components.Button.prototype.types.toggle,
            key: "keylock",
        });

        this.beatSync = new components.Button({
            midi: [0x90 + midiChannel, 0x58],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 4,
            type: components.Button.prototype.types.toggle,
            key: "sync_enabled",
            unshift: function() {
                this.inKey = "sync_enabled";
            },
            shift: function() {
                this.inKey = "sync_leader";
            },
        });

        this.silentCue = new components.Button({
            midi: [0x90 + midiChannel, 0x68],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 16,
            type: components.Button.prototype.types.toggle,
            key: "mute",
        });

        this.keyMinus = new components.Button({
            midi: [0x90 + midiChannel, 0x0A],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 91,
            type: components.Button.prototype.types.push,
            key: "pitch_down",
            unshift: function() {
                this.type = components.Button.prototype.types.push;
                this.inKey = "pitch_down";
            },
            shift: function() {
                this.type = components.Button.prototype.types.toggle;
                this.inKey = "sync_key";
            },
        });

        this.keyPlus = new components.Button({
            midi: [0x90 + midiChannel, 0x79],
            type: components.Button.prototype.types.push,
            unshift: function() {
                this.inKey = "pitch_up";
            },
            shift: function() {
                this.inKey = "reset_key";
            },
            // shiftChannel: false,
            // shiftControl: true,
            // shiftOffset: 0x3C,
        });

        this.loadTrack = new components.Button({
            midi: [0x96, 0x46 + midiChannel],
            type: components.Button.prototype.types.toggle,
            // sendShifted: true,
            // shiftChannel: false,
            // shiftControl: true,
            // shiftOffset: 18,
            inKey: "LoadSelectedTrack",
        });

        this.playButton = new components.PlayButton({
            type: components.Button.prototype.types.toggle,
            shift: function() {
                this.inKey = "play";
            },
            // shiftChannel: false,
            // shiftControl: true,
            // shiftOffset: 0x3C,
        });

        this.parameterLeft = new components.Button({
            PadModeControls: [0x24, 0x25, 0x26, 0x27, 0x28, 0x19, 0x2A, 0x2B],
            shiftedPadModeControls: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
            input: function(channel, control, value, status, group) {
                let position = this.PadModeControls.indexOf(control);
                if (position !== -1) {
                    const target = Object.values(theDeck.pads)[position];
                    if (target.parameterLeft && typeof target.parameterLeft.input === "function") {
                        target.parameterLeft.input(channel, control, value, status, group);
                    }
                }
                position = this.shiftedPadModeControls.indexOf(control);
                if (position !== -1) {
                    const target = Object.values(theDeck.pads)[position];
                    if (target.shiftParameterLeft && typeof target.shiftParameterLeft.input === "function") {
                        target.shiftParameterLeft.input(channel, control, value, status, group);
                    }
                }
            }
        });

        this.parameterRight = new components.Button({
            PadModeControls: [0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31, 0x32, 0x33],
            shiftedPadModeControls: [0x09, 0x7A, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F, 0x00],
            input: function(channel, control, value, status, group) {
                let position = this.PadModeControls.indexOf(control);
                if (position !== -1) {
                    const target = Object.values(theDeck.pads)[position];
                    if (target.parameterRight && typeof target.parameterRight.input === "function") {
                        target.parameterRight.input(channel, control, value, status, group);
                    }
                }
                position = this.shiftedPadModeControls.indexOf(control);
                if (position !== -1) {
                    const target = Object.values(theDeck.pads)[position];
                    if (target.shiftParameterRight && typeof target.shiftParameterRight.input === "function") {
                        target.shiftParameterRight.input(channel, control, value, status, group);
                    }
                }
            }
        });

        this.padMode = new components.Button({
            PadModeControls: [0x1B, 0x1E, 0x20, 0x22, 0x69, 0x6B, 0x6D, 0x6F],
            currentMode: undefined,
            getPadModeInstance: function(position) {
                if (position === undefined) {
                    position = this.currentMode;
                }
                return Object.values(theDeck.pads)[position];
            },
            init: function(position, status, control, value) {
                const target = this.getPadModeInstance(position);
                if (target.init && typeof target.init === "function") {
                    target.init(status, control, value);
                }
            },
            input: function(_channel, control, value, status, _group) {
                if (value) {
                    const position = this.PadModeControls.indexOf(control);
                    if (position !== -1) {
                        if (this.currentMode === position) {
                            this.init(position, status, control, 2);     // retrigger
                        } else {
                            if (this.currentMode) {
                                this.init(this.currentMode, status, control, 0);    // de-init
                            };
                            this.init(position, status, control, 1);     // init
                            this.currentMode = position;
                        }
                    };
                };
            },
        });

        const modeBtnColor1 = DDJXP2.RGBPioneerCode(80, 0, 255);
        const modeBtnAttnColor1 = DDJXP2.RGBPioneerCode(255, 0, 80);
        const modeBtnColor2 = DDJXP2.RGBPioneerCode(255, 255, 0);
        const modeBtnAttnColor2 = DDJXP2.RGBPioneerCode(255, 40, 0);

        this.pads = new components.ComponentContainer({
            one: new DDJXP2.PadModeContainers[engine.getSetting("pad1")](0, midiChannel, this.currentDeck, modeBtnColor1, modeBtnAttnColor1),
            two: new DDJXP2.PadModeContainers[engine.getSetting("pad2")](1, midiChannel, this.currentDeck, modeBtnColor1, modeBtnAttnColor1),
            three: new DDJXP2.PadModeContainers[engine.getSetting("pad3")](2, midiChannel, this.currentDeck, modeBtnColor1, modeBtnAttnColor1),
            four: new DDJXP2.PadModeContainers[engine.getSetting("pad4")](3, midiChannel, this.currentDeck, modeBtnColor1, modeBtnAttnColor1),
            five: new DDJXP2.PadModeContainers[engine.getSetting("pad5")](4, midiChannel, this.currentDeck, modeBtnColor2, modeBtnAttnColor2),
            six: new DDJXP2.PadModeContainers[engine.getSetting("pad6")](5, midiChannel, this.currentDeck, modeBtnColor2, modeBtnAttnColor2),
            seven: new DDJXP2.PadModeContainers[engine.getSetting("pad7")](6, midiChannel, this.currentDeck, modeBtnColor2, modeBtnAttnColor2),
            eight: new DDJXP2.PadModeContainers[engine.getSetting("pad8")](7, midiChannel, this.currentDeck, modeBtnColor2, modeBtnAttnColor2),
        });

        this.forEachComponent(function(component) {
            if (component.group === undefined) {
                component.group = this.currentDeck;
            };
        });

    }
};

DDJXP2.DeckControls2Deck = class extends components.Deck {
    constructor(deckNumbers, midiChannel) {
        super(deckNumbers);

        const theDeck = this;

        this.fader = new components.Pot({
            inKey: "volume",
            resetFader: function(_channel, control, value, status, group) {
                // midi is only triggered if FX-Button is selected
                this.inputMSB(_channel, control, 0x00, status, group);
                this.inputLSB(_channel, control, 0x00, status, group);
            },
            useForEffectPads: function(enable, group) {
                if (enable) {
                    this.group = `[QuickEffectRack1_${group}]`;
                    this.inKey = "super1";
                } else {
                    this.group = group;
                    this.inKey = "volume";
                }
            }
        });

        this.controlFX = new DDJXP2.ThreeButtonSelector({
            midibase: [[0x94 + midiChannel, 0x70], [0x94 + midiChannel, 0x71], [0x94 + midiChannel, 0x72]],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 3,
            offset: 0x70,
            key: `group_[Channel${midiChannel + 1}]_enable`,
            groupArray: ["[EffectRack1_EffectUnit1]", "[EffectRack1_EffectUnit2]", "[EffectRack1_EffectUnit3]"],
            setCurrentDeck: function(newGroup) {
                this.inKey = `group_${newGroup}_enable`;
                this.outKey = `group_${newGroup}_enable`;
                this.disconnect();
                this.connect();
            },
            setExternalModifier: function(position) {
                if (position) {
                    if (!theDeck.fader.baseGroup) {
                        theDeck.fader.baseGroup = theDeck.fader.group;
                        theDeck.fader.baseKey = theDeck.fader.inKey;
                    }
                    theDeck.fader.group = this.groupArray[position - 1];
                    theDeck.fader.inKey = "super1";
                } else {
                    if (theDeck.fader.baseGroup) {
                        theDeck.fader.group = theDeck.fader.baseGroup;
                        theDeck.fader.baseGroup = null;
                        theDeck.fader.inKey = theDeck.fader.baseKey;
                    }
                }
            }
        });

        this.toggleDeck = new components.Button({
            input: function(_channel, control, value, status, group) {
                this.baseGroup = group;
                // this is maily to allow forcing the startup-state of the controller to Deck1 and Deck2
                // nothing should be done during startup
            },
            inputReal: function(_channel, control, value, status, _group) {
                if (value) {
                    theDeck.toggle();
                    const INTBtnOnBaseDeck = (status === 0x90 + midiChannel && control === 0x73);
                    const INTBtnOnAlternateDeck = (status === 0x92 + midiChannel && control === 0x73);
                    const shiftINTOnBaseDeck = (status === 0x92 + midiChannel && control === 0x72 && this.group === this.baseGroup);
                    // const shiftINTOnAlternateDeck = (status === 0x92 + midiChannel && control === 0x72 && this.group !== this.baseGroup);

                    if (INTBtnOnBaseDeck) {
                        midi.sendShortMsg(0x92 + midiChannel, 0x72, 0x7F); // switch controller to base deck
                    };
                    if (INTBtnOnAlternateDeck) {
                        midi.sendShortMsg(0x92 + midiChannel, 0x72, 0x00); // switch controller to alternate deck
                    };
                    if (INTBtnOnBaseDeck || shiftINTOnBaseDeck) {
                        midi.sendShortMsg(0x92 + midiChannel, 0x73, 0x7F); // light up button
                    };
                }
            }
        });

        this.forEachComponent(function(component) {
            if (component.group === undefined) {
                component.group = this.currentDeck;
            };
        });
    }

    setCurrentDeck(newGroup) {
        if (this.fader.baseGroup) {
            this.fader.group = this.fader.baseGroup;
        }
        this.controlFX.setCurrentDeck(newGroup);
        super.setCurrentDeck(newGroup);
    }
};
