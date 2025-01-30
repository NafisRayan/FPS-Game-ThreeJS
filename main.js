import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

let camera, scene, renderer, controls;
let controller1, controller2;
let hand1, hand2;
let hudGroup;

init();
animate();

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);
    
    // Add VR button
    document.body.appendChild(VRButton.createButton(renderer));
    
    // Orbit controls for non-VR mode
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.6, 0);
    controls.update();
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Environment
    setupEnvironment();
    
    // VR Controllers and Hands
    setupVRControllers();
    
    // HUD
    setupHUD();
    
    // Initial camera position
    camera.position.set(0, 1.6, 3);
    
    // Event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
}

function setupEnvironment() {
    // Grid
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    
    // Reference cube
    const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x44ff44 })
    );
    cube.position.set(0, 0.25, 0);
    scene.add(cube);
}

function setupVRControllers() {
    // Controllers
    controller1 = renderer.xr.getController(0);
    controller2 = renderer.xr.getController(1);
    scene.add(controller1);
    scene.add(controller2);
    
    // Hands
    const handModelFactory = new XRHandModelFactory();
    
    hand1 = renderer.xr.getHand(0);
    scene.add(hand1);
    hand1.add(handModelFactory.createHandModel(hand1));
    
    hand2 = renderer.xr.getHand(1);
    scene.add(hand2);
    hand2.add(handModelFactory.createHandModel(hand2));
    
    // Controller grip
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
}

function setupHUD() {
    hudGroup = new THREE.Group();
    
    // Create menu panels
    createPanel(-0.8, 0.4, 0.3, 0.6); // Left menu
    createPanel(0, 0.9, 0.6, 0.1);    // Top compass
    createPanel(0.7, -0.7, 0.4, 0.3); // Chat window

    // Add scanning lines effect
    const scanlines = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                void main() {
                    float scanline = sin(vUv.y * 800.0 + time * 10.0) * 0.1;
                    gl_FragColor = vec4(0.0, scanline, 0.0, 0.1);
                }
            `,
            transparent: true
        })
    );
    hudGroup.add(scanlines);

    // Add HUD to camera
    camera.add(hudGroup);
    scene.add(camera);
}

function createPanel(x, y, width, height) {
    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    panel.position.set(x, y, -1);
    hudGroup.add(panel);
}

function updateHUD() {
    // Update compass directions
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const angle = camera.rotation.y;
    const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
    document.querySelector('.compass-bar span:nth-child(2)').textContent = directions[index];
}

function onSelectStart(event) {
    const controller = event.target;
    controller.userData.selected = true;
}

function onSelectEnd(event) {
    const controller = event.target;
    controller.userData.selected = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    const speed = 0.1;
    switch(event.key) {
        case 'w':
            camera.position.z -= speed;
            break;
        case 's':
            camera.position.z += speed;
            break;
        case 'a':
            camera.position.x -= speed;
            break;
        case 'd':
            camera.position.x += speed;
            break;
        case 'q':
            camera.position.y += speed;
            break;
        case 'e':
            camera.position.y -= speed;
            break;
    }
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    updateHUD();
    
    // Update controls only in non-VR mode
    if (!renderer.xr.isPresenting) {
        controls.update();
    }
    
    renderer.render(scene, camera);
}