// Create walls with improved textures
function createWall(x, y, z, width, height, depth) {
    const wallTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg');
    const wallBumpMap = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_bump.jpg');
    
    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshPhongMaterial({ 
            map: wallTexture,
            bumpMap: wallBumpMap,
            bumpScale: wallConfig.material.bumpScale,
            color: wallConfig.material.color,
            shininess: wallConfig.material.shininess
        })
    );
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    collisionObjects.push(wall);
    return wall;
}

// Create trees with better materials
function createTree(x, z) {
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 3, 8),
        new THREE.MeshPhongMaterial({ 
            color: 0x8B4513,
            bumpScale: 0.1,
            shininess: 5
        })
    );
    const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3, 8),
        new THREE.MeshPhongMaterial({ 
            color: 0x228B22,
            shininess: 10
        })
    );
    trunk.position.set(x, 1.5, z);
    leaves.position.set(x, 4, z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    scene.add(trunk);
    scene.add(leaves);
    collisionObjects.push(trunk);
    collisionObjects.push(leaves);
}

// Create target cubes with improved visuals
function createTarget() {
    const targetGeometry = new THREE.BoxGeometry(1, 1, 1);
    const targetMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xff0000,
        emissive: 0x600000,
        shininess: 50
    });
    const newTarget = new THREE.Mesh(targetGeometry, targetMaterial);
    
    // Random position avoiding player area
    let x, z;
    do {
        x = Math.random() * 20 - 10;
        z = Math.random() * 20 - 10;
    } while (Math.sqrt(x*x + z*z) < 5); // Keep away from player
    
    newTarget.position.set(x, 0.5, z);
    newTarget.castShadow = true;
    newTarget.receiveShadow = true;
    scene.add(newTarget);
    targets.push(newTarget);
    target = newTarget;
}

// Initialize environment
function initEnvironment() {
    // Create walls
    const walls = [
        createWall(0, 2, -15, 30, 4, 1),
        createWall(-15, 2, 0, 1, 4, 30),
        createWall(15, 2, 0, 1, 4, 30),
        createWall(0, 2, 15, 30, 4, 1)
    ];

    // Distribute trees evenly
    for(let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2;
        const radius = Math.random() * 10 + 5;
        createTree(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        );
    }
}

// Export functions
window.createTarget = createTarget;
window.spawnTargets = function spawnTargets() {
    targets.forEach(t => scene.remove(t));
    targets = [];
    const numTargets = Math.min(round + 2, 8);
    for(let i = 0; i < numTargets; i++) {
        createTarget();
    }
};

window.initEnvironment = initEnvironment;

// Initialize the environment
initEnvironment();
