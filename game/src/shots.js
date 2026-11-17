// Staged screenshot scenes (?shot=cover|chase|mission|menu). Each one sets
// up a real game state and runs the real fixed-step simulation forward, so
// the screenshots show the game as it plays — never a mock-up. The capture
// script waits for window.__shotReady.
import { Car } from './vehicles.js';

function giveCar(game, style, color, x, z, heading) {
  const car = new Car(game.scene, style, color, x, z, heading);
  game.extraCars.push(car);
  game.player.startDriving(car);
  game.camYaw = heading;
  game.camPitch = 0.3;
  return car;
}

function driveSteps(game, n, throttle, steer = 0) {
  game.scriptedDrive = { throttle, steer };
  for (let i = 0; i < n; i++) game.stepFixed(1 / 60);
  game.scriptedDrive = null;
}

export function applyShot(game, name) {
  const { player, police, missions, hud, city } = game;
  const L = city.landmarks;

  if (name === 'cover') {
    // Driving the first job toward the plaza, Sal's briefing on screen.
    missions.startMission(0);
    const car = giveCar(game, 'sport', 0xc0392b, -150, 0, -Math.PI / 2);
    car.speed = 16;
    driveSteps(game, 45, 0.75);
    hud.showDialogue('Sal', ['Dani! My best driver. A client waits at the plaza — get them to the marina, smooth and quick.']);
    hud.setObjective('First Fare', 'Pick up the client at the plaza');
  } else if (name === 'chase') {
    // Three-star pursuit down the beach road. Traffic is cleared from the
    // chase road so the staged run stays a clean pursuit, not a pile-up.
    const car = giveCar(game, 'sedan', 0x2e5f8a, -100, 52, -Math.PI / 2);
    car.speed = 24;
    for (const t of game.traffic.cars) { t.car.x = 200; t.car.z = 200; }
    police.setWanted(3);
    driveSteps(game, 6, 0.9);
    // Pull the cruisers into a tight chase behind the player, and put one
    // ahead on the road, facing the player, so the pursuit reads on screen.
    police.cruisers.forEach((c, i) => {
      const back = 16 + i * 10;
      c.x = car.x - car.forward.x * back + (i - 1) * 3.5;
      c.z = car.z - car.forward.z * back;
      c.heading = car.heading;
      c.speed = 24;
    });
    if (police.cruisers[0]) {
      const c0 = police.cruisers[0];
      c0.x = car.x + car.forward.x * 45;
      c0.z = car.z + car.forward.z * 45;
      c0.heading = car.heading + Math.PI;
      c0.speed = 0;
    }
    driveSteps(game, 25, 0.9);
    hud.addFeed('The precinct is on you — lose them!');
  } else if (name === 'mission') {
    // On foot at the Kroll site, pistol out, the ledger beacon ahead.
    missions.startMission(3);
    player.x = 152; player.z = -106; // clear of the site fence, site ahead
    player.heading = Math.atan2(L.kroll.x - player.x, L.kroll.z - player.z);
    player.weapon = 'pistol';
    player.mesh.position.set(player.x, 0, player.z);
    game.camYaw = 0.95;
    game.camPitch = 0.26;
    for (let i = 0; i < 12; i++) game.stepFixed(1 / 60);
    hud.showDialogue('Sal', ['Kroll keeps his real books in a case at the tower site. His guards are armed, Dani.']);
  } else if (name === 'menu') {
    // Start screen over the city vista; the menu stays up.
    game.menuAngle = 0.7;
    game.mode = 'menu';
    hud.showScreen('menu-start');
    for (let i = 0; i < 4; i++) game.stepFixed(1 / 60);
  }
  return true;
}
