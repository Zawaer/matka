import CoreMotion
import ExpoModulesCore

/// The phone's own motion classification from Core Motion. Untested: no iOS
/// build has been made yet. Same interface as the Android module.
public class MatkaActivityModule: Module {
  private let manager = CMMotionActivityManager()
  private let defaults = UserDefaults.standard

  private func permission(_ s: CMAuthorizationStatus) -> [String: Any] {
    let status: String
    switch s {
    case .authorized: status = "granted"
    case .denied, .restricted: status = "denied"
    default: status = "undetermined"
    }
    return ["status": status, "granted": s == .authorized, "canAskAgain": s == .notDetermined, "expires": "never"]
  }

  private func store(_ a: CMMotionActivity) {
    let type: String
    if a.automotive { type = "in_vehicle" }
    else if a.cycling { type = "on_bicycle" }
    else if a.running { type = "running" }
    else if a.walking { type = "walking" }
    else if a.stationary { type = "still" }
    else { return }
    let confidence: Int
    switch a.confidence {
    case .high: confidence = 80
    case .medium: confidence = 55
    default: confidence = 25
    }
    defaults.set(type, forKey: "matka_activity.type")
    defaults.set(confidence, forKey: "matka_activity.confidence")
    defaults.set(a.startDate.timeIntervalSince1970 * 1000, forKey: "matka_activity.at")
  }

  public func definition() -> ModuleDefinition {
    Name("MatkaActivity")

    Function("isAvailable") { CMMotionActivityManager.isActivityAvailable() }

    AsyncFunction("getPermissionsAsync") { () -> [String: Any] in
      self.permission(CMMotionActivityManager.authorizationStatus())
    }

    // iOS asks on the first motion query, so make one.
    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      self.manager.queryActivityStarting(from: Date(timeIntervalSinceNow: -60), to: Date(), to: OperationQueue.main) { _, _ in
        promise.resolve(self.permission(CMMotionActivityManager.authorizationStatus()))
      }
    }

    AsyncFunction("startAsync") { (_: Double) -> Bool in
      guard CMMotionActivityManager.isActivityAvailable() else { return false }
      self.manager.startActivityUpdates(to: OperationQueue.main) { a in
        if let a = a { self.store(a) }
      }
      return true
    }

    AsyncFunction("stopAsync") {
      self.manager.stopActivityUpdates()
    }

    Function("latest") { () -> [String: Any]? in
      guard let type = self.defaults.string(forKey: "matka_activity.type") else { return nil }
      return [
        "type": type,
        "confidence": self.defaults.integer(forKey: "matka_activity.confidence"),
        "at": self.defaults.double(forKey: "matka_activity.at"),
      ]
    }
  }
}
