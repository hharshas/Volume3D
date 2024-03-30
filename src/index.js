import * as THREE from 'three';
import { OrbitControls } from "https://unpkg.com/three@0.112/examples/jsm/controls/OrbitControls.js";

window.teal = {};
window.$t = window.teal;

class DiceManagerClass {
    constructor() {
        this.world = null;
    }

    setWorld(world) {
        this.world = world;

        this.diceBodyMaterial = new CANNON.Material();
        this.floorBodyMaterial = new CANNON.Material();
        this.barrierBodyMaterial = new CANNON.Material();

        world.addContactMaterial(
            new CANNON.ContactMaterial(this.floorBodyMaterial, this.diceBodyMaterial, { friction: 0.01, restitution: 0.5 })
        );
        world.addContactMaterial(
            new CANNON.ContactMaterial(this.barrierBodyMaterial, this.diceBodyMaterial, { friction: 0, restitution: 1.0 })
        );
        world.addContactMaterial(
            new CANNON.ContactMaterial(this.diceBodyMaterial, this.diceBodyMaterial, { friction: 0, restitution: 0.5 })
        );
    }

    /**
     *
     * @param {array} diceValues
     * @param {DiceObject} [diceValues.dice]
     * @param {number} [diceValues.value]
     *
     */
    prepareValues(diceValues) {
        if (this.throwRunning) throw new Error('Cannot start another throw. Please wait, till the current throw is finished.');

        for (let i = 0; i < diceValues.length; i++) {
            if (diceValues[i].value < 1 || diceValues[i].dice.values < diceValues[i].value) {
                throw new Error('Cannot throw die to value ' + diceValues[i].value + ', because it has only ' + diceValues[i].dice.values + ' sides.');
            }
        }

        this.throwRunning = true;

        for (let i = 0; i < diceValues.length; i++) {
            diceValues[i].dice.simulationRunning = true;
            diceValues[i].vectors = diceValues[i].dice.getCurrentVectors();
            diceValues[i].stableCount = 0;
        }

        let check = () => {
            let allStable = true;
            for (let i = 0; i < diceValues.length; i++) {
                if (diceValues[i].dice.isFinished()) {
                    diceValues[i].stableCount++;
                } else {
                    diceValues[i].stableCount = 0;
                }

                if (diceValues[i].stableCount < 50) {
                    allStable = false;
                }
            }

            if (allStable) {
                console.log("all stable");
                DiceManager.world.removeEventListener('postStep', check);

                for (let i = 0; i < diceValues.length; i++) {
                    diceValues[i].dice.shiftUpperValue(diceValues[i].value);
                    diceValues[i].dice.setVectors(diceValues[i].vectors);
                    diceValues[i].dice.simulationRunning = false;
                }

                this.throwRunning = false;
            } else {
                DiceManager.world.step(DiceManager.world.dt);
            }
        };

        this.world.addEventListener('postStep', check);
    }
}

class DiceObject {
    /**
     * @constructor
     * @param {object} options
     * @param {Number} [options.size = 100]
     * @param {Number} [options.fontColor = '#000000']
     * @param {Number} [options.backColor = '#ffffff']
     */
    constructor(options) {
        options = this.setDefaults(options, {
            size: 100,
            fontColor: '#000000',
            backColor: '#ffffff'
        });

        this.object = null;
        this.size = options.size;
        this.invertUpside = false;

        this.materialOptions = {
            specular: 0x172022,
            color: 0xf0f0f0,
            shininess: 40,
            shading: THREE.FlatShading,
        };
        this.labelColor = options.fontColor;
        this.diceColor = options.backColor;
    }

    setDefaults(options, defaults) {
        options = options || {};

        for (let key in defaults) {
            if (!defaults.hasOwnProperty(key)) continue;

            if (!(key in options)) {
                options[key] = defaults[key];
            }
        }

        return options;
    }

    emulateThrow(callback) {
        let stableCount = 0;

        let check = () => {
            if (this.isFinished()) {
                stableCount++;

                if (stableCount === 50) {
                    DiceManager.world.removeEventListener('postStep', check);
                    callback(this.getUpsideValue());
                }
            } else {
                stableCount = 0;
            }

            DiceManager.world.step(DiceManager.world.dt);
        };

        DiceManager.world.addEventListener('postStep', check);
    }

    isFinished() {
        let threshold = 1;

        let angularVelocity = this.object.body.angularVelocity;
        let velocity = this.object.body.velocity;

        return (Math.abs(angularVelocity.x) < threshold && Math.abs(angularVelocity.y) < threshold && Math.abs(angularVelocity.z) < threshold &&
            Math.abs(velocity.x) < threshold && Math.abs(velocity.y) < threshold && Math.abs(velocity.z) < threshold);
    }

    getUpsideValue() {
        let vector = new THREE.Vector3(0, this.invertUpside ? -1 : 1);
        let closest_face;
        let closest_angle = Math.PI * 2;
        for (let i = 0; i < this.object.geometry.faces.length; ++i) {
            let face = this.object.geometry.faces[i];
            if (face.materialIndex === 0) continue;

            let angle = face.normal.clone().applyQuaternion(this.object.body.quaternion).angleTo(vector);
            if (angle < closest_angle) {
                closest_angle = angle;
                closest_face = face;
            }
        }

        return closest_face.materialIndex - 1;
    }

    getCurrentVectors() {
        return {
            position: this.object.body.position.clone(),
            quaternion: this.object.body.quaternion.clone(),
            velocity: this.object.body.velocity.clone(),
            angularVelocity: this.object.body.angularVelocity.clone()
        };
    }

    setVectors(vectors) {
        this.object.body.position = vectors.position;
        this.object.body.quaternion = vectors.quaternion;
        this.object.body.velocity = vectors.velocity;
        this.object.body.angularVelocity = vectors.angularVelocity;
    }

    shiftUpperValue(toValue) {
        let geometry = this.object.geometry.clone();

        let fromValue = this.getUpsideValue();

        for (let i = 0, l = geometry.faces.length; i < l; ++i) {
            let materialIndex = geometry.faces[i].materialIndex;
            if (materialIndex === 0) continue;

            materialIndex += toValue - fromValue - 1;
            while (materialIndex > this.values) materialIndex -= this.values;
            while (materialIndex < 1) materialIndex += this.values;

            geometry.faces[i].materialIndex = materialIndex + 1;
        }

        this.object.geometry = geometry;
    }

    getChamferGeometry(vectors, faces, chamfer) {
        let chamfer_vectors = [],
            chamfer_faces = [],
            corner_faces = new Array(vectors.length);
        for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
        for (let i = 0; i < faces.length; ++i) {
            let ii = faces[i],
                fl = ii.length - 1;
            let center_point = new THREE.Vector3();
            let face = new Array(fl);
            for (let j = 0; j < fl; ++j) {
                let vv = vectors[ii[j]].clone();
                center_point.add(vv);
                corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
            }
            center_point.divideScalar(fl);
            for (let j = 0; j < fl; ++j) {
                let vv = chamfer_vectors[face[j]];
                vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
            }
            face.push(ii[fl]);
            chamfer_faces.push(face);
        }
        for (let i = 0; i < faces.length - 1; ++i) {
            for (let j = i + 1; j < faces.length; ++j) {
                let pairs = [],
                    lastm = -1;
                for (let m = 0; m < faces[i].length - 1; ++m) {
                    let n = faces[j].indexOf(faces[i][m]);
                    if (n >= 0 && n < faces[j].length - 1) {
                        if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
                        else pairs.push([i, m], [j, n]);
                        lastm = m;
                    }
                }
                if (pairs.length !== 4) continue;
                chamfer_faces.push([chamfer_faces[pairs[0][0]][pairs[0][1]],
                    chamfer_faces[pairs[1][0]][pairs[1][1]],
                    chamfer_faces[pairs[3][0]][pairs[3][1]],
                    chamfer_faces[pairs[2][0]][pairs[2][1]], -1
                ]);
            }
        }
        for (let i = 0; i < corner_faces.length; ++i) {
            let cf = corner_faces[i],
                face = [cf[0]],
                count = cf.length - 1;
            while (count) {
                for (let m = faces.length; m < chamfer_faces.length; ++m) {
                    let index = chamfer_faces[m].indexOf(face[face.length - 1]);
                    if (index >= 0 && index < 4) {
                        if (--index === -1) index = 3;
                        let next_vertex = chamfer_faces[m][index];
                        if (cf.indexOf(next_vertex) >= 0) {
                            face.push(next_vertex);
                            break;
                        }
                    }
                }
                --count;
            }
            face.push(-1);
            chamfer_faces.push(face);
        }
        return { vectors: chamfer_vectors, faces: chamfer_faces };
    }

    makeGeometry(vertices, faces, radius, tab, af) {
        let geom = new THREE.Geometry();
        for (let i = 0; i < vertices.length; ++i) {
            let vertex = vertices[i].multiplyScalar(radius);
            vertex.index = geom.vertices.push(vertex) - 1;
        }
        for (let i = 0; i < faces.length; ++i) {
            let ii = faces[i],
                fl = ii.length - 1;
            let aa = Math.PI * 2 / fl;
            for (let j = 0; j < fl - 2; ++j) {
                geom.faces.push(new THREE.Face3(ii[0], ii[j + 1], ii[j + 2], [geom.vertices[ii[0]],
                    geom.vertices[ii[j + 1]], geom.vertices[ii[j + 2]]
                ], 0, ii[fl] + 1));
                geom.faceVertexUvs[0].push([
                    new THREE.Vector2((Math.cos(af) + 1 + tab) / 2 / (1 + tab),
                        (Math.sin(af) + 1 + tab) / 2 / (1 + tab)),
                    new THREE.Vector2((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
                        (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)),
                    new THREE.Vector2((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
                        (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab))
                ]);
            }
        }
        geom.computeFaceNormals();
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        return geom;
    }

    createShape(vertices, faces, radius) {
        let cv = new Array(vertices.length),
            cf = new Array(faces.length);
        for (let i = 0; i < vertices.length; ++i) {
            let v = vertices[i];
            cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
        }
        for (let i = 0; i < faces.length; ++i) {
            cf[i] = faces[i].slice(0, faces[i].length - 1);
        }
        return new CANNON.ConvexPolyhedron(cv, cf);
    }

    getGeometry() {
        let radius = this.size * this.scaleFactor;

        let vectors = new Array(this.vertices.length);
        for (let i = 0; i < this.vertices.length; ++i) {
            vectors[i] = (new THREE.Vector3).fromArray(this.vertices[i]).normalize();
        }

        let chamferGeometry = this.getChamferGeometry(vectors, this.faces, this.chamfer);
        let geometry = this.makeGeometry(chamferGeometry.vectors, chamferGeometry.faces, radius, this.tab, this.af);
        geometry.cannon_shape = this.createShape(vectors, this.faces, radius);

        return geometry;
    }

    calculateTextureSize(approx) {
        return Math.max(128, Math.pow(2, Math.floor(Math.log(approx) / Math.log(2))));
    }

    createTextTexture(text, color, backColor) {
        let canvas = document.createElement("canvas");
        let context = canvas.getContext("2d");
        let ts = this.calculateTextureSize(this.size / 2 + this.size * this.textMargin) * 2;
        canvas.width = canvas.height = ts;
        context.font = ts / (1 + 2 * this.textMargin) + "pt Arial";
        context.fillStyle = backColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = color;
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        let texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    getMaterials() {
        let materials = [];
        for (let i = 0; i < this.faceTexts.length; ++i) {
            let texture = null;
            if (this.customTextTextureFunction) {
                texture = this.customTextTextureFunction(this.faceTexts[i], this.labelColor, this.diceColor);
            } else {
                texture = this.createTextTexture(this.faceTexts[i], this.labelColor, this.diceColor);
            }

            materials.push(new THREE.MeshPhongMaterial(Object.assign({}, this.materialOptions, { map: texture })));
        }
        return materials;
    }

    getObject() {
        return this.object;
    }

    create() {
        if (!DiceManager.world) throw new Error('You must call DiceManager.setWorld(world) first.');
        this.object = new THREE.Mesh(this.getGeometry(), new THREE.MultiMaterial(this.getMaterials()));

        this.object.reveiceShadow = true;
        this.object.castShadow = true;
        this.object.diceObject = this;
        this.object.body = new CANNON.Body({
            mass: this.mass,
            shape: this.object.geometry.cannon_shape,
            material: DiceManager.diceBodyMaterial
        });
        this.object.body.linearDamping = 0.1;
        this.object.body.angularDamping = 0.1;
        DiceManager.world.add(this.object.body);

        return this.object;
    }

    updateMeshFromBody() {
        if (!this.simulationRunning) {
            this.object.position.copy(this.object.body.position);
            this.object.quaternion.copy(this.object.body.quaternion);
        }
    }

    updateBodyFromMesh() {
        this.object.body.position.copy(this.object.position);
        this.object.body.quaternion.copy(this.object.quaternion);
    }
}

export class DiceD4 extends DiceObject {
    constructor(options) {
        super(options);

        this.tab = -0.1;
        this.af = Math.PI * 7 / 6;
        this.chamfer = 0.96;
        this.vertices = [
            [1, 1, 1],
            [-1, -1, 1],
            [-1, 1, -1],
            [1, -1, -1]
        ];
        this.faces = [
            [1, 0, 2, 1],
            [0, 1, 3, 2],
            [0, 3, 2, 3],
            [1, 2, 3, 4]
        ];
        this.scaleFactor = 1.2;
        this.values = 4;
        this.faceTexts = [
            [],
            ['0', '0', '0'],
            ['2', '4', '3'],
            ['1', '3', '4'],
            ['2', '1', '4'],
            ['1', '2', '3']
        ];
        this.customTextTextureFunction = function(text, color, backColor) {
            let canvas = document.createElement("canvas");
            let context = canvas.getContext("2d");
            let ts = this.calculateTextureSize(this.size / 2 + this.size * 2) * 2;
            canvas.width = canvas.height = ts;
            context.font = ts / 5 + "pt Arial";
            context.fillStyle = backColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = color;
            for (let i in text) {
                context.fillText(text[i], canvas.width / 2,
                    canvas.height / 2 - ts * 0.3);
                context.translate(canvas.width / 2, canvas.height / 2);
                context.rotate(Math.PI * 2 / 3);
                context.translate(-canvas.width / 2, -canvas.height / 2);
            }
            let texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        };
        this.mass = 2000;
        this.inertia = 5;
        this.invertUpside = true;

        this.create();
    }
}

export class DiceD6 extends DiceObject {
    constructor(options) {
        super(options);

        this.tab = 0.1;
        this.af = Math.PI / 4;
        this.chamfer = 0.96;
        this.vertices = [
            [-1, -1, -1],
            [1, -1, -1],
            [1, 1, -1],
            [-1, 1, -1],
            [-1, -1, 1],
            [1, -1, 1],
            [1, 1, 1],
            [-1, 1, 1]
        ];
        this.faces = [
            [0, 3, 2, 1, 1],
            [1, 2, 6, 5, 2],
            [0, 1, 5, 4, 3],
            [3, 7, 6, 2, 4],
            [0, 4, 7, 3, 5],
            [4, 5, 6, 7, 6]
        ];
        this.scaleFactor = 0.9;
        this.values = 6;
        this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
        ];
        this.textMargin = 1.0;
        this.mass = 2000;
        this.inertia = 13;

        this.create();
    }
}

export class DiceD8 extends DiceObject {
    constructor(options) {
        super(options);

        this.tab = 0;
        this.af = -Math.PI / 4 / 2;
        this.chamfer = 0.965;
        this.vertices = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1]
        ];
        this.faces = [
            [0, 2, 4, 1],
            [0, 4, 3, 2],
            [0, 3, 5, 3],
            [0, 5, 2, 4],
            [1, 3, 4, 5],
            [1, 4, 2, 6],
            [1, 2, 5, 7],
            [1, 5, 3, 8]
        ];
        this.scaleFactor = 1;
        this.values = 8;
        this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
        ];
        this.textMargin = 1.2;
        this.mass = 2400;
        this.inertia = 10;

        this.create();
    }
}

export class DiceD10 extends DiceObject {

    constructor(options) {
        super(options);

        this.tab = 0;
        this.af = Math.PI * 6 / 5;
        this.chamfer = 0.945;
        this.vertices = [];
        this.faces = [
            [5, 7, 11, 0],
            [4, 2, 10, 1],
            [1, 3, 11, 2],
            [0, 8, 10, 3],
            [7, 9, 11, 4],
            [8, 6, 10, 5],
            [9, 1, 11, 6],
            [2, 0, 10, 7],
            [3, 5, 11, 8],
            [6, 4, 10, 9],
            [1, 0, 2, -1],
            [1, 2, 3, -1],
            [3, 2, 4, -1],
            [3, 4, 5, -1],
            [5, 4, 6, -1],
            [5, 6, 7, -1],
            [7, 6, 8, -1],
            [7, 8, 9, -1],
            [9, 8, 0, -1],
            [9, 0, 1, -1]
        ];

        for (let i = 0, b = 0; i < 10; ++i, b += Math.PI * 2 / 10) {
            this.vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
        }
        this.vertices.push([0, 0, -1]);
        this.vertices.push([0, 0, 1]);

        this.scaleFactor = 0.9;
        this.values = 10;
        this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
        ];
        this.textMargin = 1.0;
        this.mass = 2500;
        this.inertia = 9;

        this.create();
    }
}

export class DiceD12 extends DiceObject {
    constructor(options) {
        super(options);

        let p = (1 + Math.sqrt(5)) / 2;
        let q = 1 / p;

        this.tab = 0.2;
        this.af = -Math.PI / 4 / 2;
        this.chamfer = 0.968;
        this.vertices = [
            [0, q, p],
            [0, q, -p],
            [0, -q, p],
            [0, -q, -p],
            [p, 0, q],
            [p, 0, -q],
            [-p, 0, q],
            [-p, 0, -q],
            [q, p, 0],
            [q, -p, 0],
            [-q, p, 0],
            [-q, -p, 0],
            [1, 1, 1],
            [1, 1, -1],
            [1, -1, 1],
            [1, -1, -1],
            [-1, 1, 1],
            [-1, 1, -1],
            [-1, -1, 1],
            [-1, -1, -1]
        ];
        this.faces = [
            [2, 14, 4, 12, 0, 1],
            [15, 9, 11, 19, 3, 2],
            [16, 10, 17, 7, 6, 3],
            [6, 7, 19, 11, 18, 4],
            [6, 18, 2, 0, 16, 5],
            [18, 11, 9, 14, 2, 6],
            [1, 17, 10, 8, 13, 7],
            [1, 13, 5, 15, 3, 8],
            [13, 8, 12, 4, 5, 9],
            [5, 4, 14, 9, 15, 10],
            [0, 12, 8, 10, 16, 11],
            [3, 19, 7, 17, 1, 12]
        ];
        this.scaleFactor = 0.9;
        this.values = 12;
        this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
        ];
        this.textMargin = 1.0;
        this.mass = 2500;
        this.inertia = 8;

        this.create();
    }
}

export class DiceD20 extends DiceObject {
    constructor(options) {
        super(options);

        let t = (1 + Math.sqrt(5)) / 2;

        this.tab = -0.2;
        this.af = -Math.PI / 4 / 2;
        this.chamfer = 0.955;
        this.vertices = [
            [-1, t, 0],
            [1, t, 0],
            [-1, -t, 0],
            [1, -t, 0],
            [0, -1, t],
            [0, 1, t],
            [0, -1, -t],
            [0, 1, -t],
            [t, 0, -1],
            [t, 0, 1],
            [-t, 0, -1],
            [-t, 0, 1]
        ];
        this.faces = [
            [0, 11, 5, 1],
            [0, 5, 1, 2],
            [0, 1, 7, 3],
            [0, 7, 10, 4],
            [0, 10, 11, 5],
            [1, 5, 9, 6],
            [5, 11, 4, 7],
            [11, 10, 2, 8],
            [10, 7, 6, 9],
            [7, 1, 8, 10],
            [3, 9, 4, 11],
            [3, 4, 2, 12],
            [3, 2, 6, 13],
            [3, 6, 8, 14],
            [3, 8, 9, 15],
            [4, 9, 5, 16],
            [2, 4, 11, 17],
            [6, 2, 10, 18],
            [8, 6, 7, 19],
            [9, 8, 1, 20]
        ];
        this.scaleFactor = 1;
        this.values = 20;
        this.faceTexts = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'
        ];
        this.textMargin = 1.0;
        this.mass = 3000;
        this.inertia = 6;

        this.create();
    }
}

//---------------------------------------------//

export const DiceManager = new DiceManagerClass();

if (typeof define === 'function' && define.amd) {
    define(function() {
        return {
            DiceManager: DiceManager,
            DiceD4: DiceD4,
            DiceD6: DiceD6,
            DiceD8: DiceD8,
            DiceD10: DiceD10,
            DiceD12: DiceD12,
            DiceD20: DiceD20,
        };
    });
} else if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        DiceManager: DiceManager,
        DiceD4: DiceD4,
        DiceD6: DiceD6,
        DiceD8: DiceD8,
        DiceD10: DiceD10,
        DiceD12: DiceD12,
        DiceD20: DiceD20,
    };
} else {
    window.Dice = {
        DiceManager: DiceManager,
        DiceD4: DiceD4,
        DiceD6: DiceD6,
        DiceD8: DiceD8,
        DiceD10: DiceD10,
        DiceD12: DiceD12,
        DiceD20: DiceD20,
    };
}


// standard global variables
var container,
    scene,
    camera,
    renderer,
    controls,
    stats,
    world,
    dice = [],
    type = 0,
    label = 0;



init();

// FUNCTIONS
function init() {
    // SCENE
    scene = new THREE.Scene();
    // CAMERA
    var SCREEN_WIDTH = window.innerWidth,
        SCREEN_HEIGHT = window.innerHeight - document.getElementById("main-toolbar").clientHeight;
    var VIEW_ANGLE = 45,
        ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
        NEAR = 0.01,
        FAR = 20000;
    camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
    scene.add(camera);
    camera.position.set(0, 20, 60);
    // RENDERER
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container = document.getElementById("ThreeJS");
    container.appendChild(renderer.domElement);
    // EVENTS
    // CONTROLS
    controls = new OrbitControls(camera, renderer.domElement);
    // STATS
    // stats = new Stats();
    // stats.domElement.style.position = "absolute";
    // stats.domElement.style.bottom = "0px";
    // stats.domElement.style.zIndex = 100;
    // container.appendChild(stats.domElement);

    let ambient = new THREE.AmbientLight("#ffffff", 0.3);
    scene.add(ambient);

    let directionalLight = new THREE.DirectionalLight("#ffffff", 0.5);
    directionalLight.position.x = -1000;
    directionalLight.position.y = 1000;
    directionalLight.position.z = 1000;
    scene.add(directionalLight);

    let light = new THREE.SpotLight(0xefdfd5, 1.3);
    light.position.y = 100;
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.camera.near = 50;
    light.shadow.camera.far = 110;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    scene.add(light);

    // FLOOR
    const floortexture = new THREE.TextureLoader().load(
        "https://i.ibb.co/TtGrzgY/floor.jpg",
        render
    );
    var floorMaterial = new THREE.MeshBasicMaterial({
        color: "#5c4937",
        side: THREE.DoubleSide,
        map: floortexture
    });
    var floorGeometry = new THREE.PlaneGeometry(300, 300, 300, 300);
    var floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    floor.rotation.x = Math.PI / 2;
    scene.add(floor);

    var width = 10;
    var length = 8;
    // var geometry = new THREE.BoxGeometry(width, length, height);
    // var textureloader = new THREE.TextureLoader();
    // var texture = textureloader.load('images/tile_brick.png', function(tx) {
    //     var material = new THREE.MeshBasicMaterial({
    //         map: tx,
    //         wireframe: false
    //     });
    //     var cube = new THREE.Mesh(geometry, material);
    //     scene.add(cube);
    // });
    floortexture.wrapS = THREE.RepeatWrapping;
    floortexture.wrapT = THREE.RepeatWrapping;
    floortexture.repeat.set(width, length);
    // SKYBOX/FOG
    var skyBoxGeometry = new THREE.CubeGeometry(10000, 10000, 10000);
    var skyBoxMaterial = new THREE.MeshPhongMaterial({
        color: 0xC5FFF8,
        side: THREE.BackSide
    });
    var skyBox = new THREE.Mesh(skyBoxGeometry, skyBoxMaterial);
    scene.add(skyBox);
    scene.fog = new THREE.FogExp2(0xC5FFF8, 0.00025);

    ////////////
    // CUSTOM //
    ////////////
    world = new CANNON.World();

    world.gravity.set(0, -9.82 * 20, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 16;

    DiceManager.setWorld(world);

    //Floor
    let floorBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: DiceManager.floorBodyMaterial
    });
    console.log(floorBody.quaternion);
    floorBody.quaternion.setFromAxisAngle(
        new CANNON.Vec3(1, 0, 0), -Math.PI / 2
    );
    world.add(floorBody);

    //shake effect

    function shakeFloor() {
        var cnt = 0;
        var interval = setInterval(() => {
            cnt++;
            if (cnt == 4) clearInterval(interval);
            if (cnt % 2) camera.position.y += 1;
            else camera.position.y -= 1;
        }, 100)
    }


    //Walls

    var colors = ["#ff0000", "#ffff00", "#00ff00", "#0000ff", "#ff00ff"];
    var diceValues = [];

    function foreachdice(a) {
        diceValues = [];
        for (var i = a; i < dice.length; i++) {
            let yRand = Math.random() * 20;
            dice[i].getObject().position.x = -15 - (i) * 2;
            dice[i].getObject().position.y = 2 + Math.floor(i / 3) * 1.5;
            dice[i].getObject().position.z = -15 + (i) * 2;
            dice[i].getObject().quaternion.x =
                ((Math.random() * 90 - 45) * Math.PI) / 180;
            dice[i].getObject().quaternion.z =
                ((Math.random() * 90 - 45) * Math.PI) / 180;
            dice[i].updateBodyFromMesh();
            let rand = Math.random() * 5;
            dice[i]
                .getObject()
                .body.velocity.set(25 + rand, 40 + yRand, 15 + rand);
            dice[i]
                .getObject()
                .body.angularVelocity.set(
                    20 * Math.random() - 10,
                    20 * Math.random() - 10,
                    20 * Math.random() - 10
                );
            let v = Math.ceil(Math.random() * dice[i].values);
            diceValues.push({ dice: dice[i], value: v });
        }

        DiceManager.prepareValues(diceValues);
    }

    function accelerator() {
        shakeFloor();
        foreachdice(0);
        var sum = 0,
            ind = 0;
        document.getElementById("result").innerHTML = ``;
        diceValues.forEach((element, index) => {
            if (element.dice.labelColor !== null) {
                if (ind === 0) document.getElementById("result").innerHTML += `${element.value} `;
                else document.getElementById("result").innerHTML += `+ ${element.value} `;
                sum += element.value;
                ind++;
            }
        });
        document.getElementById("result").innerHTML += ` = ${sum}`;
    }

    function randomDiceThrow() {
        var die, textStyle = null;
        if (label % 2) textStyle = "#000000";
        var clr = $t.color;
        // clr = document.getElementById("color-button").value;
        // var textStyle = document.querySelector("input[name=switch-one]:checked").value;
        if (type == 0) {
            die = new DiceD4({ size: 1.5, backColor: clr, fontColor: textStyle });
        } else if (type == 1) {
            die = new DiceD6({ size: 1.5, backColor: clr, fontColor: textStyle });
        } else if (type == 2) {
            die = new DiceD8({ size: 1.5, backColor: clr, fontColor: textStyle });
        } else if (type == 3) {
            die = new DiceD12({ size: 1.5, backColor: clr, fontColor: textStyle });
        } else if (type == 4) {
            die = new DiceD20({ size: 1.5, backColor: clr, fontColor: textStyle });
        } else return;
        die.getObject().name = die.getObject().uuid;
        scene.add(die.getObject());
        dice.push(die);
        foreachdice(dice.length - 1);
    }

    const raycaster = new THREE.Raycaster();

    renderer.domElement.onpointerdown = (event) => {
        if (event.button === 0 && type == 5) {
            // calculate pointer position in normalized device coordinates
            // (-1 to +1) for both components
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);

            const intersects = raycaster.intersectObjects(scene.children);
            if (intersects.length > 0) {
                console.log(intersects[0].object.name);
                const objectName = intersects[0].object.name;
                const obj = scene.getObjectByName(objectName);
                var ind = -1;
                dice.forEach((element, index) => {
                    if (element.getObject().name === objectName) {
                        console.log(index);
                        ind = index;
                    }
                });
                if (ind > -1) dice.splice(ind, 1);
                scene.remove(obj);
            }
        }
    }

    // document
    //     .querySelector("#ThreeJS")
    //     .addEventListener("click", randomDiceThrow);
    document
        .querySelector("#accelerator")
        .addEventListener("click", accelerator);
    teal.changeTexture = function changeTexture(value) {
        scene.remove(floor);
        var selectedValue = value;
        const texture = new THREE.TextureLoader().load(
            selectedValue,
            render
        );
        var Mat = new THREE.MeshBasicMaterial({
            color: "#5c4937",
            side: THREE.DoubleSide,
            map: texture
        });
        floor = new THREE.Mesh(floorGeometry, Mat);
        floor.receiveShadow = true;
        floor.rotation.x = Math.PI / 2;
        scene.add(floor);
    };

    const mouse = new THREE.Vector2();
    const intersectionPoint = new THREE.Vector3();
    const planeNormal = new THREE.Vector3();
    const plane = new THREE.Plane();

    const pointer = new THREE.Vector2();

    document
        .querySelector("#ThreeJS")
        .addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / (window.innerHeight + document.getElementById("main-toolbar").clientHeight)) * 2 + 1;
            planeNormal.copy(camera.position).normalize();
            plane.setFromNormalAndCoplanarPoint(planeNormal, scene.position);
            raycaster.setFromCamera(mouse, camera);
            raycaster.ray.intersectPlane(plane, intersectionPoint);
        });

    document
        .querySelector("#ThreeJS")
        .addEventListener('click', (e) => {
            // const sphereGeo = new THREE.SphereGeometry(0.125, 30, 30);
            // const sphereMat = new THREE.MeshStandardMaterial({
            //     color: 0xFFEA00,
            //     metalness: 0,
            //     roughness: 0
            // });
            // const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
            // scene.add(sphereMesh);
            var die, textStyle = null;
            if (label % 2) textStyle = "#000000";
            var clr = $t.color;
            // clr = document.getElementById("color-button").value;
            // var textStyle = document.querySelector("input[name=switch-one]:checked").value;
            if (type == 0) {
                die = new DiceD4({ size: 1.5, backColor: clr, fontColor: textStyle });
            } else if (type == 1) {
                die = new DiceD6({ size: 1.5, backColor: clr, fontColor: textStyle });
            } else if (type == 2) {
                die = new DiceD8({ size: 1.5, backColor: clr, fontColor: textStyle });
            } else if (type == 3) {
                die = new DiceD12({ size: 1.5, backColor: clr, fontColor: textStyle });
            } else if (type == 4) {
                die = new DiceD20({ size: 1.5, backColor: clr, fontColor: textStyle });
            } else return;
            die.getObject().name = die.getObject().uuid;
            scene.add(die.getObject());
            dice.push(die);

            // die.getObject().position.copy(intersectionPoint);
            let yRand = Math.random() * 20;
            die.getObject().position.copy(intersectionPoint);
            die.getObject().quaternion.x =
                ((Math.random() * 90 - 45) * Math.PI) / 180;
            die.getObject().quaternion.z =
                ((Math.random() * 90 - 45) * Math.PI) / 180;
            die.updateBodyFromMesh();
            let rand = Math.random() * 5;
            die
                .getObject()
                .body.velocity.set(0, 40, 0);
            die
                .getObject()
                .body.angularVelocity.set(
                    20 * Math.random() - 10,
                    20 * Math.random() - 10,
                    20 * Math.random() - 10
                );
            let v = Math.ceil(Math.random() * die.values);
            diceValues.push({ dice: die, value: v });

            DiceManager.prepareValues(diceValues);
        })
}
// document.addEventListener( "mousemove", onDocumentMouseMove, false );

function switchToType(newtype) {
    document.getElementById("add-button-D4").classList.remove('active');
    document.getElementById("add-button-D6").classList.remove('active');
    document.getElementById("add-button-D8").classList.remove('active');
    document.getElementById("add-button-D12").classList.remove('active');
    document.getElementById("add-button-D20").classList.remove('active');
    document.getElementById("del-button").classList.remove('active');

    if (newtype == 0) document.getElementById("add-button-D4").classList.add('active');
    else if (newtype == 1) document.getElementById("add-button-D6").classList.add('active');
    else if (newtype == 2) document.getElementById("add-button-D8").classList.add('active');
    else if (newtype == 3) document.getElementById("add-button-D12").classList.add('active');
    else if (newtype == 4) document.getElementById("add-button-D20").classList.add('active');
    else document.getElementById("del-button").classList.add('active');
}



// handle toolbar buttons
document.getElementById("add-button-D4").addEventListener('click', function(e) {
    type = 0;
    switchToType(type);
}, true);
document.getElementById("add-button-D6").addEventListener('click', function(e) {
    type = 1;
    switchToType(type);
}, true);

document.getElementById("add-button-D8").addEventListener('click', function(e) {
    type = 2;
    switchToType(type);
}, true);

document.getElementById("add-button-D12").addEventListener('click', function(e) {
    type = 3;
    switchToType(type);
}, true);

document.getElementById("add-button-D20").addEventListener('click', function(e) {
    type = 4;
    switchToType(type);
}, true);

document.getElementById("del-button").addEventListener('click', function(e) {
    type = 5;
    switchToType(type);
}, true);

document.getElementById("is-label").addEventListener('click', () => {
    label++;
    if (label % 2) document.getElementById("is-label").classList.add("active");
    else document.getElementById("is-label").classList.remove("active");
})

// Launch tutorial
// document.getElementById("help-button").addEventListener('click', function(e) {
//     tutorial.start();
// });


requestAnimationFrame(animate);

function animate() {
    updatePhysics();
    render();
    update();

    requestAnimationFrame(animate);
}

function updatePhysics() {
    world.step(1.0 / 60.0);

    for (var i in dice) {
        dice[i].updateMeshFromBody();
    }
}

function update() {
    controls.update();
    // stats.update();
}

function render() {
    renderer.render(scene, camera);
}

// teal variables
teal.color = "#ffffff";